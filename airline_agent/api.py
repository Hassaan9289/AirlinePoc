from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .data import ACTIVE_DATASET
from .tools import get_reservation, update_reservation_seats

app = FastAPI(title="Airline Agent Calendar API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SeatSelectionRequest(BaseModel):
    selected_seats: List[str] = Field(default_factory=list, alias="selectedSeats")

    model_config = ConfigDict(populate_by_name=True, str_strip_whitespace=True)

    @field_validator("selected_seats", mode="before")
    @classmethod
    def _ensure_iterable(cls, value):
        if value is None:
            return []
        if isinstance(value, (str, int)):
            return [value]
        return value

    @field_validator("selected_seats")
    @classmethod
    def _normalize(cls, value: List[str]):
        seen = set()
        normalized: List[str] = []
        for seat in value:
            seat_id = str(seat).strip().upper()
            if not seat_id or seat_id in seen:
                continue
            seen.add(seat_id)
            normalized.append(seat_id)
        return normalized


def _format_offset(dt: datetime) -> str:
    offset = dt.utcoffset()
    if offset is None:
        return "UTC"
    total_minutes = int(offset.total_seconds() // 60)
    sign = "+" if total_minutes >= 0 else "-"
    total_minutes = abs(total_minutes)
    hours = total_minutes // 60
    minutes = total_minutes % 60
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def _split_datetime(dt_raw: str) -> Dict[str, Any]:
    dt = datetime.fromisoformat(dt_raw)
    return {
        "iso": dt_raw,
        "date": dt.date().isoformat(),
        "time": dt.strftime("%H:%M"),
        "weekday": dt.strftime("%A"),
        "utc_offset": _format_offset(dt),
    }


@app.get("/health", tags=["health"])
def healthcheck() -> Dict[str, str]:
    return {"status": "ok"}


@app.get("/api/arrivals", tags=["flights"])
def get_arrival_calendar() -> Dict[str, Any]:
    flights: List[Dict[str, Any]] = ACTIVE_DATASET["flights"]
    calendar_index: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    enriched_flights: List[Dict[str, Any]] = []

    for flight in flights:
        arrival = _split_datetime(flight["arrival_time"])
        departure = _split_datetime(flight["departure_time"])
        summary = {
            "flight_id": flight["flight_id"],
            "airline": flight["airline"],
            "flight_number": flight["flight_number"],
            "departure_city": flight["departure_city"],
            "arrival_city": flight["arrival_city"],
            "departure_airport_code": flight["departure_airport_code"],
            "arrival_airport_code": flight["arrival_airport_code"],
            "status": flight["status"],
            "arrival": arrival,
            "departure": departure,
        }
        enriched_flights.append(summary)
        calendar_index[arrival["date"]].append(summary)

    ordered_dates = sorted(calendar_index.keys())
    calendar = [
        {
            "date": date,
            "weekday": datetime.fromisoformat(date).strftime("%A"),
            "flights": calendar_index[date],
        }
        for date in ordered_dates
    ]

    meta = {}
    if ordered_dates:
        meta = {
            "total_flights": len(enriched_flights),
            "first_arrival": ordered_dates[0],
            "last_arrival": ordered_dates[-1],
        }

    return {
        "calendar": calendar,
        "flights": enriched_flights,
        "meta": meta,
    }


@app.get("/api/reservations/{reservation_id}", tags=["reservations"])
def reservation_detail(reservation_id: str) -> Dict[str, Any]:
    envelope = get_reservation(reservation_id)
    if not envelope.get("ok"):
        raise HTTPException(status_code=404, detail=envelope)
    return envelope


@app.patch("/api/reservations/{reservation_id}/seats", tags=["reservations"])
def reservation_update_seats(reservation_id: str, payload: SeatSelectionRequest) -> Dict[str, Any]:
    envelope = update_reservation_seats(reservation_id, payload.selected_seats)
    if not envelope.get("ok"):
        status = 404 if envelope.get("code") == "RESERVATION_NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=envelope)
    return envelope
