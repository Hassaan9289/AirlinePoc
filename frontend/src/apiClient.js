import axios from 'axios';

export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_APP_API_BASE_URL1 ||
  'http://localhost:8000'
).replace(/\/$/, '');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

export const createSession = async () => {
  const response = await apiClient.post('http://127.0.0.1:8000/apps/airline_agent/users/user/sessions');
  return response.data;
};

export const sendChatMessage = async ({ sessionId, message }) => {
  const response = await apiClient.post('http://127.0.0.1:8000/run', {
    appName: 'airline_agent',
    userId: 'user',
    sessionId,
    newMessage: {
      role: 'user',
      parts: [{ text: message }],
    },
    streaming: false,
  });
  return response.data;
};

export const extractSessionId = (payload) => {
  if (!payload) {
    return '';
  }
  const maybeSession =
    payload.session?.name ||
    payload.sessionId ||
    payload.name ||
    payload.id ||
    payload.session?.id;

  return typeof maybeSession === 'string' ? maybeSession : '';
};

const looksLikeReservationEnvelope = (value) => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const container = value?.data ?? value;
  const reservation = container?.reservation;
  return (
    reservation &&
    typeof reservation === 'object' &&
    typeof reservation.reservation_id === 'string'
  );
};

const normalizeReservationPayload = (value) => {
  const container = value?.data ?? value;
  const reservation = container?.reservation ?? {};
  const bill = container?.bill ?? value?.bill ?? null;
  const seatSelectionRaw = container?.seat_selection ?? {};
  const fromReservation = Array.isArray(reservation.seat_assignments)
    ? reservation.seat_assignments
    : [];
  const selectedCandidates = Array.isArray(seatSelectionRaw.selected_seats)
    ? seatSelectionRaw.selected_seats
    : seatSelectionRaw.selectedSeats;
  const normalizedSeats = Array.isArray(selectedCandidates)
    ? selectedCandidates
    : fromReservation;
  const selectedSeats = Array.from(
    new Set(
      normalizedSeats
        .filter((seat) => seat !== null && seat !== undefined)
        .map((seat) => String(seat).trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  const seatSelection = {
    selectedSeats,
    updatedAt:
      seatSelectionRaw.updated_at ?? seatSelectionRaw.updatedAt ?? reservation.seat_assignments_updated_at ?? null,
  };

  const seatMap = container?.seat_map ?? container?.seatMap ?? null;

  return {
    reservationId: reservation.reservation_id,
    seatClass: reservation.seat_class,
    passengerCount: reservation.passenger_count,
    bookedAt: reservation.booked_at,
    totalPriceUsd: reservation.total_price_usd,
    passengers: Array.isArray(reservation.passengers) ? reservation.passengers : [],
    flight: reservation.flight_details ?? null,
    bill,
    seatMap,
    seatSelection,
    selectedSeats,
    raw: reservation,
  };
};

const collectReservationsDeep = (value, results, seen, visited = new WeakSet()) => {
  if (!value || typeof value !== 'object' || visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectReservationsDeep(item, results, seen, visited));
    return;
  }

  if (looksLikeReservationEnvelope(value)) {
    const normalized = normalizeReservationPayload(value);
    if (!seen.has(normalized.reservationId)) {
      results.push(normalized);
      seen.add(normalized.reservationId);
    }
  }

  Object.values(value).forEach((nested) =>
    collectReservationsDeep(nested, results, seen, visited),
  );
};

export const extractReservations = (payload) => {
  if (!payload) {
    return [];
  }
  const results = [];
  const seen = new Set();
  collectReservationsDeep(payload, results, seen);
  return results;
};

export const fetchReservationById = async (reservationId) => {
  if (!reservationId) {
    const error = new Error('Reservation ID is required.');
    error.code = 'RESERVATION_ID_REQUIRED';
    throw error;
  }

  try {
    const response = await apiClient.get(`/api/reservations/${reservationId}`);
    const envelope = response.data;
    if (!envelope?.ok) {
      const error = new Error(
        envelope?.message ?? 'Unable to load the reservation details right now.',
      );
      error.code = envelope?.code ?? 'RESERVATION_FETCH_FAILED';
      error.envelope = envelope;
      throw error;
    }

    return {
      reservation: normalizeReservationPayload(envelope),
      envelope,
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail ?? error.response.data;
      const message =
        detail?.message ??
        (status === 404
          ? 'We could not find a reservation with that ID.'
          : 'Unable to load the reservation details right now.');
      const enriched = new Error(message);
      enriched.code = detail?.code ?? 'RESERVATION_FETCH_FAILED';
      enriched.status = status;
      enriched.envelope = detail;
      throw enriched;
    }
    throw error;
  }
};

export const updateReservationSeatSelection = async ({ reservationId, seats }) => {
  if (!reservationId) {
    const error = new Error('Reservation ID is required.');
    error.code = 'RESERVATION_ID_REQUIRED';
    throw error;
  }

  const normalizedSeats = Array.from(
    new Set(
      (Array.isArray(seats) ? seats : [])
        .filter((seat) => seat !== null && seat !== undefined)
        .map((seat) => String(seat).trim().toUpperCase())
        .filter(Boolean),
    ),
  );

  try {
    const response = await apiClient.patch(`/api/reservations/${reservationId}/seats`, {
      selected_seats: normalizedSeats,
    });
    const envelope = response.data;
    if (!envelope?.ok) {
      const error = new Error(
        envelope?.message ?? 'Unable to update seat selection right now.',
      );
      error.code = envelope?.code ?? 'SEAT_SELECTION_UPDATE_FAILED';
      error.envelope = envelope;
      throw error;
    }

    return {
      reservation: normalizeReservationPayload(envelope),
      envelope,
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data?.detail ?? error.response.data;
      const message =
        detail?.message ??
        (status === 404
          ? 'We could not find that reservation when updating seats.'
          : 'Unable to update seat selection right now.');
      const enriched = new Error(message);
      enriched.code = detail?.code ?? 'SEAT_SELECTION_UPDATE_FAILED';
      enriched.status = status;
      enriched.envelope = detail;
      throw enriched;
    }
    throw error;
  }
};

const collectTextsDeep = (value, texts, visited = new WeakSet()) => {
  if (!value) {
    return;
  }

  if (typeof value !== 'object') {
    return;
  }

  if (visited.has(value)) {
    return;
  }
  visited.add(value);

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextsDeep(item, texts, visited));
    return;
  }

  if (Array.isArray(value.parts)) {
    value.parts.forEach((part) => collectTextsDeep(part, texts, visited));
  }

  if (typeof value.text === 'string' && value.text.trim()) {
    texts.push(value.text.trim());
  }

  if (value.content) {
    collectTextsDeep(value.content, texts, visited);
  }

  if (value.candidates) {
    collectTextsDeep(value.candidates, texts, visited);
  }

  if (value.contents) {
    collectTextsDeep(value.contents, texts, visited);
  }

  if (value.output) {
    collectTextsDeep(value.output, texts, visited);
  }

  if (value.response) {
    collectTextsDeep(value.response, texts, visited);
  }

  if (value.result) {
    collectTextsDeep(value.result, texts, visited);
  }

  if (value.data) {
    collectTextsDeep(value.data, texts, visited);
  }

  if (Array.isArray(value.messages)) {
    collectTextsDeep(value.messages, texts, visited);
  }
};

export const extractAssistantReplies = (payload) => {
  if (!payload) {
    return [];
  }

  const texts = [];
  const response = payload.response ?? payload.result ?? payload;

  const potentialSources = [
    response?.output,
    response?.candidate,
    response?.candidates,
    payload?.events,
    payload?.output,
    payload?.response,
    payload,
  ];

  potentialSources.forEach((source) => collectTextsDeep(source, texts));

  const filtered = texts.filter((text) => {
    if (typeof text !== 'string') {
      return false;
    }
    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }
    const hasSentenceChar = /[a-zA-Z]/.test(trimmed);
    const isMetadata = /^[A-Z0-9_\-]+$/.test(trimmed) && trimmed.length <= 20;
    return hasSentenceChar && !isMetadata;
  });

  return filtered.length ? filtered : texts;
};
