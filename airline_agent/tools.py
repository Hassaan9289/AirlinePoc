# aroya_air/tools.py
from __future__ import annotations
from typing import Dict, Any, List, Optional
import json
import datetime as dt
import logging
import random
from pathlib import Path

from .models import (
    ResponseEnvelope, SearchCriteria, BookingDetails, Reservation, Flight, Passenger, CLASS_MULTIPLIER
)
from .utils import (
    now_utc, gen_reservation_id, load_flights, is_bookable,
    matches_cities, matches_date, validate_passenger_age_vs_dob,
    parse_date_flexible, facets_for, normalize
)
from .data import ACTIVE_DATASET

logger = logging.getLogger(__name__)

_RESERVATIONS: Dict[str, Reservation] = {}
_RESERVATION_STORE_PATH = Path(__file__).with_name("reservations_store.json")
_SEAT_COLUMNS: tuple[str, ...] = ("A", "B", "C", "D", "E", "F")
_DEFAULT_SEAT_ROWS = 18
_SEAT_TYPE_PATTERN = ("window", "middle", "aisle", "aisle", "middle", "window")


def _refresh_reservation_cache() -> None:
    """
    Reload reservations persisted on disk so cross-process access stays in sync.
    """
    if not _RESERVATION_STORE_PATH.exists():
        return

    try:
        raw_data = json.loads(_RESERVATION_STORE_PATH.read_text(encoding="utf-8"))
    except Exception as exc:  # pragma: no cover - defensive path
        logger.warning("Unable to load reservation store: %s", exc)
        return

    if not isinstance(raw_data, dict):
        logger.warning("Reservation store was not a JSON object; ignoring refresh.")
        return

    _RESERVATIONS.clear()
    for reservation_id, payload in raw_data.items():
        try:
            _RESERVATIONS[reservation_id] = Reservation.model_validate(payload)
        except Exception as exc:  # pragma: no cover - corrupted record
            logger.warning("Skipping invalid reservation entry %s: %s", reservation_id, exc)


def _persist_reservation_cache() -> None:
    try:
        serializable = {
            reservation_id: reservation.model_dump(mode="json")
            for reservation_id, reservation in _RESERVATIONS.items()
        }
        _RESERVATION_STORE_PATH.write_text(
            json.dumps(serializable, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    except Exception as exc:  # pragma: no cover - disk issues
        logger.error("Failed to persist reservation store: %s", exc)


_refresh_reservation_cache()

def _envelope(ok: bool, code: str, message: str, data: Dict[str, Any]) -> Dict[str, Any]:
    return ResponseEnvelope(ok=ok, code=code, message=message, data=data).model_dump(mode="json")

def _find_flight_by_id(flights: List[Flight], flight_id: str) -> Optional[Flight]:
    for f in flights:
        if f.flight_id == flight_id:
            return f
    return None


def _seat_type_for_index(index: int) -> str:
    if 0 <= index < len(_SEAT_TYPE_PATTERN):
        return _SEAT_TYPE_PATTERN[index]
    return "middle"


def _build_base_rows(total_rows: int) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for row_number in range(1, total_rows + 1):
        seats: List[Dict[str, Any]] = []
        for column_index, column_letter in enumerate(_SEAT_COLUMNS):
            seat_id = f"{row_number}{column_letter}"
            seats.append(
                {
                    "id": seat_id,
                    "display": seat_id,
                    "status": "available",
                    "type": _seat_type_for_index(column_index),
                    "extra": {
                        "legroom": row_number in (1, 2),
                        "exitRow": row_number in (9, 10),
                    },
                }
            )
        rows.append(
            {
                "id": f"row-{row_number}",
                "label": str(row_number),
                "seats": seats,
            }
        )
    return rows


def _normalize_seat_ids(values: Optional[List[Any]]) -> List[str]:
    if not values:
        return []
    seen: set[str] = set()
    normalized: List[str] = []
    for entry in values:
        if entry is None:
            continue
        text = str(entry).strip().upper()
        if not text or text in seen:
            continue
        seen.add(text)
        normalized.append(text)
    return normalized


def _build_seat_map(reservation: Reservation) -> Dict[str, Any]:
    flight_info = reservation.flight_details
    if isinstance(flight_info, dict):
        flight = Flight.model_validate(flight_info)
        reservation.flight_details = flight
    else:
        flight = flight_info
    estimated_rows = max(
        10,
        min(
            24,
            (flight.seats_available // len(_SEAT_COLUMNS)) + 6,
        ),
    )
    total_rows = max(_DEFAULT_SEAT_ROWS, estimated_rows)
    rows = _build_base_rows(total_rows)
    seat_ids = [seat["id"] for row in rows for seat in row["seats"]]
    total_capacity = len(seat_ids)

    selected_set = set(_normalize_seat_ids(reservation.seat_assignments))
    for row in rows:
        for seat in row["seats"]:
            seat["selected"] = seat["id"] in selected_set

    effective_available = max(len(selected_set), min(flight.seats_available, total_capacity))
    booked_target = max(0, min(total_capacity - effective_available, total_capacity))
    held_target = min(6, booked_target // 4)
    pending_target = min(4, max(0, effective_available // 10))

    rng = random.Random(f"{flight.flight_id}:{reservation.reservation_id}")
    shuffled = seat_ids[:]
    rng.shuffle(shuffled)

    booked_set: set[str] = set()
    held_set: set[str] = set()
    pending_set: set[str] = set()

    for seat_id in shuffled:
        if seat_id in selected_set:
            continue
        if len(booked_set) < booked_target:
            booked_set.add(seat_id)
            continue
        if len(held_set) < held_target:
            held_set.add(seat_id)
            continue
        if len(pending_set) < pending_target:
            pending_set.add(seat_id)
            continue

    available_count = 0
    for row in rows:
        for seat in row["seats"]:
            seat_id = seat["id"]
            if seat_id in booked_set:
                seat["status"] = "booked"
            elif seat_id in held_set:
                seat["status"] = "held"
            elif seat_id in pending_set:
                seat["status"] = "pending"
            else:
                seat["status"] = "available"
                if not seat.get("selected"):
                    available_count += 1

    updated_at = reservation.seat_assignments_updated_at or reservation.booked_at
    layout_descriptor = f"{len(_SEAT_COLUMNS)//2}-{len(_SEAT_COLUMNS)//2} configuration"
    meta = {
        "totalSeats": total_capacity,
        "availableSeats": max(0, available_count),
        "bookedSeats": len(booked_set),
        "heldSeats": len(held_set),
        "pendingSeats": len(pending_set),
        "selectedSeats": len(selected_set),
        "updatedAt": updated_at.isoformat() if isinstance(updated_at, dt.datetime) else None,
        "layout": layout_descriptor,
        "inventory": {
            "reportedAvailable": flight.seats_available,
        },
    }

    return {
        "sections": [
            {
                "id": "main-cabin",
                "label": f"{flight.aircraft_type} cabin",
                "subtitle": f"Rows 1-{total_rows} · {layout_descriptor}",
                "rows": rows,
            }
        ],
        "meta": meta,
    }


def _reservation_bill(reservation: Reservation) -> Dict[str, Any]:
    pax_count = max(1, reservation.passenger_count)
    total_price = float(reservation.total_price_usd)
    unit_price = total_price / pax_count if pax_count else total_price
    return {
        "currency": "USD",
        "unit_price": round(unit_price, 2),
        "passengers": pax_count,
        "subtotal": total_price,
        "total": total_price,
    }


def _reservation_payload(reservation: Reservation) -> Dict[str, Any]:
    seat_selection = {
        "selected_seats": _normalize_seat_ids(reservation.seat_assignments),
        "updated_at": (
            reservation.seat_assignments_updated_at.isoformat()
            if isinstance(reservation.seat_assignments_updated_at, dt.datetime)
            else (reservation.booked_at.isoformat() if isinstance(reservation.booked_at, dt.datetime) else None)
        ),
    }
    return {
        "reservation": reservation.model_dump(mode="json"),
        "bill": _reservation_bill(reservation),
        "seat_selection": seat_selection,
        "seat_map": _build_seat_map(reservation),
    }

# -------- date coercion (unchanged from prior fix) --------
def _coerce_date_to_iso(raw: Any) -> Optional[str]:
    if raw is None:
        return None
    if isinstance(raw, dt.datetime):
        return raw.date().isoformat()
    if isinstance(raw, dt.date):
        return raw.isoformat()
    if isinstance(raw, str):
        s = raw.strip()
        try:
            iso_dt = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
            return iso_dt.date().isoformat()
        except Exception:
            pass
        parsed = parse_date_flexible(s)
        return parsed.isoformat() if parsed else None
    return None

# -------- helper: parse passengers flexibly --------
def _parse_passengers(
    passenger_count: Optional[int],
    passengers: Optional[List[Dict[str, Any]]],
    passengers_json: Optional[str],
    # single-passenger fallback fields:
    passenger_name: Optional[str],
    passenger_age: Optional[int],
    passenger_gender: Optional[str],
    passenger_dob: Optional[str],
    passenger_email: Optional[str],
) -> Dict[str, Any]:
    """
    Returns:
      {
        "passenger_dicts": List[dict],    # raw dicts (may be incomplete)
        "count": int,                     # inferred or provided
        "errors": List[str]               # fatal parse errors (e.g., bad JSON)
      }
    """
    errors: List[str] = []
    plist: List[Dict[str, Any]] = []

    if isinstance(passengers, list) and passengers:
        plist = passengers
    elif passengers_json:
        try:
            loaded = json.loads(passengers_json)
            if isinstance(loaded, list):
                plist = loaded
            else:
                errors.append("passengers_json must be a JSON array.")
        except Exception as e:
            errors.append(f"Invalid passengers_json: {e}")
    elif any([passenger_name, passenger_age, passenger_gender, passenger_dob, passenger_email]):
        # Build a single-passenger list from flattened fields
        plist = [{
            "name": passenger_name,
            "age": passenger_age,
            "gender": passenger_gender,
            "dob": passenger_dob,
            "email": passenger_email,
        }]

    # Infer count if not provided
    inferred_count = passenger_count if passenger_count and passenger_count > 0 else (len(plist) if plist else 1)

    # If provided count mismatches provided list length, do not fail immediately; report as issue in preview.
    return {"passenger_dicts": plist, "count": inferred_count, "errors": errors}

# ---------------------------
# get_available_flights (unchanged except seat check uses c.passengers)
# ---------------------------
def get_available_flights(
    departure_city: Optional[str] = None,
    arrival_city: Optional[str] = None,
    departure_date: Optional[str] = None,
    passengers: Optional[int] = 1,
    class_preference: Optional[str] = None,
    date: Optional[str] = None,         # synonyms accepted
    travel_date: Optional[str] = None,
) -> Dict[str, Any]:
    raw_date = departure_date or travel_date or date
    parsed_iso = _coerce_date_to_iso(raw_date)

    crit = {
        "departure_city": departure_city,
        "arrival_city": arrival_city,
        "departure_date": parsed_iso,
        "passengers": passengers or 1,
        "class_preference": class_preference,
    }
    try:
        c = SearchCriteria(**{k: v for k, v in crit.items() if v is not None})
    except Exception as e:
        return _envelope(False, "FLIGHT_SEARCH_INVALID_INPUT", "Invalid search criteria.", {"error": str(e), "criteria": crit})

    flights = load_flights(ACTIVE_DATASET.get("flights", []))

    # strict route filter when both cities present
    if c.departure_city and c.arrival_city:
        filtered_city = [
            f for f in flights
            if normalize(f.departure_city) == normalize(c.departure_city)
            and normalize(f.arrival_city) == normalize(c.arrival_city)
            and is_bookable(f)
            and (f.seats_available >= (c.passengers or 1))  # seat check
            and (not c.class_preference or c.class_preference in f.available_classes)
        ]
    else:
        filtered_city = [
            f for f in flights
            if matches_cities(f, c)
            and is_bookable(f)
            and (f.seats_available >= (c.passengers or 1))
            and (not c.class_preference or c.class_preference in f.available_classes)
        ]

    # optional exact-date filter
    filtered = [f for f in filtered_city if matches_date(f, c.departure_date)]

    facet_info = facets_for(flights, c)
    results = sorted(filtered, key=lambda x: (x.price_usd, -x.seats_available))
    public = [f.to_public() for f in results]

    needs: List[str] = []
    if not c.departure_city:
        needs.append("departure_city")
    if c.departure_city and not c.arrival_city:
        needs.append("arrival_city")
    if c.departure_city and c.arrival_city and not c.departure_date:
        needs.append("departure_date")

    if c.departure_city and c.arrival_city:
        if public:
            code = "FLIGHT_SEARCH_OK"
            msg = f"Found {len(public)} flight(s) from {c.departure_city} to {c.arrival_city}."
        else:
            code = "FLIGHT_SEARCH_PARTIAL_OK"
            msg  = (f"No exact-date results yet for {c.departure_city} → {c.arrival_city}. "
                    "Here are available dates you can pick.")
    else:
        code = "FLIGHT_SEARCH_EXPLORE"
        msg = "Select a destination and/or date from the available options."

    return _envelope(True, code, msg, {
        "criteria": c.model_dump(mode="json"),
        "flights": public,
        "facets": facet_info,
        "needs": needs
    })

def _unit_price_for_class(f: Flight, seat_class: str) -> float:
    """Return per-passenger unit price for the chosen class (derived from base)."""
    mul = CLASS_MULTIPLIER.get(seat_class, 1.0)
    return round(float(f.price_usd) * mul, 2)

# ------------------------
# create_reservation  — MULTI‑PASSENGER
# ------------------------
def create_reservation(
    flight_id: str,
    seat_class: str = "Economy",
    confirm: bool = False,
    # multi-passenger inputs
    passenger_count: Optional[int] = None,
    passengers: Optional[List[Dict[str, Any]]] = None,
    passengers_json: Optional[str] = None,
    # single-passenger fallback
    passenger_name: Optional[str] = None,
    passenger_age: Optional[int] = None,
    passenger_gender: Optional[str] = None,
    passenger_dob: Optional[str] = None,
    passenger_email: Optional[str] = None,
) -> Dict[str, Any]:

    flights = load_flights(ACTIVE_DATASET.get("flights", []))
    f = _find_flight_by_id(flights, flight_id)
    if not f:
        return _envelope(False, "RESERVATION_FLIGHT_NOT_FOUND", "Flight not found.", {"flight_id": flight_id})

    if not is_bookable(f):
        return _envelope(False, "RESERVATION_UNBOOKABLE", f"Flight status is '{f.status.value}'. Not bookable.", {"flight": f.to_public()})

    if seat_class not in f.available_classes:
        return _envelope(False, "RESERVATION_CLASS_NOT_AVAILABLE",
                         f"Seat class '{seat_class}' not available for this flight.", {"available": f.available_classes})

    parsed = _parse_passengers(
        passenger_count=passenger_count,
        passengers=passengers,
        passengers_json=passengers_json,
        passenger_name=passenger_name,
        passenger_age=passenger_age,
        passenger_gender=passenger_gender,
        passenger_dob=passenger_dob,
        passenger_email=passenger_email,
    )
    raw_list = parsed["passenger_dicts"]
    pax_count = parsed["count"]
    parse_errors = parsed["errors"]

    if f.seats_available < pax_count:
        return _envelope(False, "RESERVATION_NO_SEATS",
                         f"Only {f.seats_available} seat(s) left; requested {pax_count}.",
                         {"flight": f.to_public(), "requested_passengers": pax_count})

    issues: List[Dict[str, Any]] = []
    validated_passengers: List[Passenger] = []

    def _missing(field, idx): return {"index": idx, "field": field, "message": "Required field is missing."}

    if not raw_list and pax_count > 0:
        raw_list = [{} for _ in range(pax_count)]

    for idx in range(max(pax_count, len(raw_list))):
        entry = raw_list[idx] if idx < len(raw_list) else {}
        name = entry.get("name")
        age = entry.get("age")
        gender = entry.get("gender")
        dob = entry.get("dob")
        email = entry.get("email")

        missing = []
        if not name:   missing.append(_missing("name", idx))
        if age is None: missing.append(_missing("age", idx))
        if not gender: missing.append(_missing("gender", idx))
        if not dob:    missing.append(_missing("dob", idx))
        if not email:  missing.append(_missing("email", idx))

        if missing:
            issues.extend(missing)
            continue

        if isinstance(dob, str):
            dob_iso = _coerce_date_to_iso(dob)
            dob = dob_iso or dob

        try:
            p_obj = Passenger(name=name, age=int(age), gender=gender, dob=dob, email=email)
        except Exception as e:
            issues.append({"index": idx, "field": "passenger", "message": str(e)})
            continue

        ok_age, calc_age = validate_passenger_age_vs_dob(p_obj, now_utc())
        if not ok_age:
            issues.append({"index": idx, "field": "age", "message": f"Age does not match DOB; expected approximately {calc_age}."})

        validated_passengers.append(p_obj)

    # 💰 Pricing
    unit_price = _unit_price_for_class(f, seat_class)
    total = round(unit_price * max(1, pax_count), 2)
    bill = {
        "currency": "USD",
        "unit_price": unit_price,
        "passengers": max(1, pax_count),
        "subtotal": total,   # if you want taxes/fees later, add them here
        "total": total
    }

    # Preview
    if not confirm:
        return _envelope(True, "RESERVATION_PREVIEW",
                         "Preview generated. Provide any missing/invalid passenger details, then confirm to book.",
                         {
                             "flight": f.to_public(),
                             "seat_class": seat_class,
                             "passenger_count": pax_count,
                             "passengers": [p.model_dump(mode='json') for p in validated_passengers],
                             "pending_entries": raw_list,
                             "validation": {"ok": len(issues) == 0 and len(parse_errors) == 0,
                                            "issues": issues,
                                            "parse_errors": parse_errors},
                             "bill": bill,               # 👈 show per-class unit price & total
                             "next_action": "ask_confirmation" if not issues and not parse_errors else "collect_missing_passenger_details"
                         })

    # Confirm: require all passengers valid & counts match
    if issues or parse_errors or len(validated_passengers) != pax_count:
        return _envelope(False, "RESERVATION_VALIDATION_FAILED",
                         "Passenger details failed validation. Please correct before confirming.",
                         {
                             "passenger_count": pax_count,
                             "provided_valid": len(validated_passengers),
                             "validation": {"ok": False, "issues": issues, "parse_errors": parse_errors}
                         })

    reservation_id = gen_reservation_id()
    reservation = Reservation(
        reservation_id=reservation_id,
        flight_id=f.flight_id,
        passengers=validated_passengers,
        passenger_count=pax_count,
        seat_class=seat_class,
        total_price_usd=total,       # 👈 per-class total
        booked_at=now_utc(),
        flight_details=f,
    )
    reservation.seat_assignments = []
    reservation.seat_assignments_updated_at = reservation.booked_at
    _RESERVATIONS[reservation_id] = reservation
    _persist_reservation_cache()

    return _envelope(
        True,
        "RESERVATION_CONFIRMED",
        "Your reservation is confirmed.",
        _reservation_payload(reservation),
    )


def get_reservation(reservation_id: str) -> Dict[str, Any]:
    """
    Retrieve a previously confirmed reservation by its identifier.
    """
    _refresh_reservation_cache()
    reservation = _RESERVATIONS.get(reservation_id)
    if not reservation:
        return _envelope(
            False,
            "RESERVATION_NOT_FOUND",
            "Reservation not found.",
            {"reservation_id": reservation_id},
        )

    return _envelope(
        True,
        "RESERVATION_FOUND",
        "Reservation retrieved.",
        _reservation_payload(reservation),
    )


def update_reservation_seats(reservation_id: str, seat_codes: Optional[List[str]]) -> Dict[str, Any]:
    """
    Persist seat assignments for a reservation and regenerate the cabin map.
    """
    _refresh_reservation_cache()
    reservation = _RESERVATIONS.get(reservation_id)
    if not reservation:
        return _envelope(
            False,
            "RESERVATION_NOT_FOUND",
            "Reservation not found.",
            {"reservation_id": reservation_id},
        )

    normalized = _normalize_seat_ids(seat_codes)
    max_allowed = max(1, reservation.passenger_count)

    if len(normalized) > max_allowed:
        trimmed = normalized[:max_allowed]
        logger.info(
            "Trimming seat selection for %s to passenger count (%s -> %s).",
            reservation_id,
            normalized,
            trimmed,
        )
        normalized = trimmed

    reservation.seat_assignments = normalized
    reservation.seat_assignments_updated_at = now_utc()
    _RESERVATIONS[reservation_id] = reservation
    _persist_reservation_cache()

    return _envelope(
        True,
        "SEAT_SELECTION_UPDATED",
        "Seat selection updated.",
        _reservation_payload(reservation),
    )
