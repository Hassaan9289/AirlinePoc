import { useEffect, useMemo, useState } from 'react';
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';

import { fetchReservationById } from '../apiClient';
import './ReservationConfirmationPage.css';

const formatDateTime = (iso) => {
  if (!iso) {
    return '';
  }
  const dt = new Date(iso);
  return dt.toLocaleString(undefined, {
    dateStyle: 'long',
    timeStyle: 'short',
  });
};

const formatMoney = (value, currency = 'USD') => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '';
  }
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(value);
};

const formatPassengerLabel = (index) => `Passenger ${index + 1}`;

function ReservationConfirmationPage() {
  const { reservationId: paramReservationId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();

  const fallbackId = searchParams.get('id') || '';
  const reservationId = paramReservationId || fallbackId;

  const preloadedReservation =
    location.state?.reservation &&
    location.state.reservation.reservationId === reservationId
      ? location.state.reservation
      : null;

  const [reservation, setReservation] = useState(preloadedReservation || null);
  const [loading, setLoading] = useState(!preloadedReservation);
  const [error, setError] = useState(reservationId ? '' : 'Reservation ID missing from the link.');
  const [refreshCount, setRefreshCount] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState('');

  useEffect(() => {
    let cancelled = false;

    if (!reservationId) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    async function loadReservation() {
      try {
        setError('');
        const { reservation: normalized } = await fetchReservationById(reservationId);
        if (!cancelled) {
          setReservation(normalized);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load reservation', err);
          const message =
            err?.message ??
            'Unable to retrieve the reservation at this time. Please try again later.';
          setError(message);
          setReservation(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    const hasInitialPreload = Boolean(preloadedReservation) && refreshCount === 0;

    if (hasInitialPreload) {
      setReservation(preloadedReservation);
    }

    if (!hasInitialPreload || refreshCount > 0) {
      setLoading(true);
    } else {
      setLoading(false);
    }

    loadReservation();

    return () => {
      cancelled = true;
    };
  }, [reservationId, refreshCount, preloadedReservation]);

  const flight = reservation?.flight ?? null;
  const departure = flight?.from ?? null;
  const arrival = flight?.to ?? null;
  const totalDue = useMemo(() => {
    if (typeof reservation?.bill?.total === 'number') {
      return reservation.bill.total;
    }
    if (typeof reservation?.bill?.subtotal === 'number') {
      return reservation.bill.subtotal;
    }
    return reservation?.totalPriceUsd ?? null;
  }, [reservation]);
  const currency = reservation?.bill?.currency ?? 'USD';
  const passengers = reservation?.passengers ?? [];
  const passengerCount = reservation?.passengerCount ?? passengers.length;

  const paymentBreakdown = useMemo(() => {
    if (!reservation?.bill) {
      return [];
    }
    const lines = [];
    if (reservation.bill.currency) {
      lines.push({ label: 'Currency', value: reservation.bill.currency });
    }
    if (typeof reservation.bill.unit_price === 'number') {
      lines.push({
        label: 'Unit price',
        value: formatMoney(reservation.bill.unit_price, currency),
      });
    }
    if (typeof reservation.bill.passengers === 'number') {
      lines.push({ label: 'Passengers billed', value: reservation.bill.passengers });
    }
    if (typeof reservation.bill.subtotal === 'number') {
      lines.push({
        label: 'Subtotal',
        value: formatMoney(reservation.bill.subtotal, currency),
      });
    }
    if (typeof reservation.bill.total === 'number') {
      lines.push({
        label: 'Total due',
        value: formatMoney(reservation.bill.total, currency),
      });
    }
    return lines;
  }, [reservation, currency]);

  const handleRetry = () => {
    setRefreshCount((count) => count + 1);
  };

  const handlePayment = async () => {
    if (!reservation || isProcessingPayment) {
      return;
    }
    setIsProcessingPayment(true);
    setPaymentMessage('');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      setPaymentMessage(
        'Payment processing is not connected yet. Hook up your payment gateway to capture funds.',
      );
    } catch (err) {
      console.error('Payment handler failed', err);
      setPaymentMessage('We could not start the payment flow. Please try again.');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  return (
    <div className="reservation-confirmation-page">
      <div className="reservation-confirmation-page__content">
        <div className="reservation-confirmation-page__top">
          <button
            type="button"
            className="reservation-confirmation-back"
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
          <div className="reservation-confirmation-brand">
            <span className="reservation-confirmation-brand__mark">ez</span>
            <span className="reservation-confirmation-brand__name">booking</span>
            <span className="reservation-confirmation-brand__trade">TM</span>
          </div>
        </div>

        <header className="reservation-confirmation-header">
          <p className="reservation-confirmation-header__eyebrow">Booking confirmation</p>
          <h1 className="reservation-confirmation-header__title">
            {reservationId ? `Reservation ${reservationId}` : 'Reservation'}
          </h1>
          {reservation?.bookedAt ? (
            <p className="reservation-confirmation-header__timestamp">
              Confirmed {formatDateTime(reservation.bookedAt)}
            </p>
          ) : null}
        </header>

        <main className="reservation-confirmation-card">
          {loading ? (
            <div className="reservation-confirmation-status">Loading reservation details…</div>
          ) : error ? (
            <div className="reservation-confirmation-error">
              <p>{error}</p>
              <div className="reservation-confirmation-error__actions">
                <button type="button" onClick={handleRetry}>
                  Try again
                </button>
                <button type="button" onClick={() => navigate('/')}>
                  Back to assistant
                </button>
              </div>
            </div>
          ) : reservation ? (
            <>
              <section className="reservation-section">
                <h2>Booking overview</h2>
                <div className="reservation-details-grid">
                  <div>
                    <span className="reservation-details-label">Passengers</span>
                    <span className="reservation-details-value">
                      {passengerCount}{' '}
                      {passengerCount === 1 ? 'traveler' : 'travelers'}
                    </span>
                  </div>
                  {reservation.seatClass ? (
                    <div>
                      <span className="reservation-details-label">Cabin class</span>
                      <span className="reservation-details-value">
                        {reservation.seatClass}
                      </span>
                    </div>
                  ) : null}
                  {typeof totalDue === 'number' ? (
                    <div>
                      <span className="reservation-details-label">Total price</span>
                      <span className="reservation-details-value">
                        {formatMoney(totalDue, currency)}
                      </span>
                    </div>
                  ) : null}
                  {flight?.flight_number ? (
                    <div>
                      <span className="reservation-details-label">Flight</span>
                      <span className="reservation-details-value">{flight.flight_number}</span>
                    </div>
                  ) : null}
                  {flight?.flight_id ? (
                    <div>
                      <span className="reservation-details-label">Flight ID</span>
                      <span className="reservation-details-value">{flight.flight_id}</span>
                    </div>
                  ) : null}
                  {flight?.status ? (
                    <div>
                      <span className="reservation-details-label">Status</span>
                      <span className="reservation-details-value">{flight.status}</span>
                    </div>
                  ) : null}
                </div>
              </section>

              <section className="reservation-section reservation-section--split">
                <div className="reservation-card">
                  <h3>Flight itinerary</h3>
                  <dl className="reservation-definition">
                    {flight?.airline ? (
                      <>
                        <dt>Airline</dt>
                        <dd>{flight.airline}</dd>
                      </>
                    ) : null}
                    {departure?.city || arrival?.city ? (
                      <>
                        <dt>Route</dt>
                        <dd>
                          {departure?.city ?? departure?.code ?? 'N/A'} →{' '}
                          {arrival?.city ?? arrival?.code ?? 'N/A'}
                        </dd>
                      </>
                    ) : null}
                    {departure?.departure_time ? (
                      <>
                        <dt>Departure</dt>
                        <dd>
                          {formatDateTime(departure.departure_time)}
                          {departure?.airport ? ` — ${departure.airport} (${departure.code})` : ''}
                        </dd>
                      </>
                    ) : null}
                    {arrival?.arrival_time ? (
                      <>
                        <dt>Arrival</dt>
                        <dd>
                          {formatDateTime(arrival.arrival_time)}
                          {arrival?.airport ? ` — ${arrival.airport} (${arrival.code})` : ''}
                        </dd>
                      </>
                    ) : null}
                    {flight?.duration ? (
                      <>
                        <dt>Duration</dt>
                        <dd>{flight.duration}</dd>
                      </>
                    ) : null}
                    {flight?.aircraft_type ? (
                      <>
                        <dt>Aircraft</dt>
                        <dd>{flight.aircraft_type}</dd>
                      </>
                    ) : null}
                    {flight?.baggage_allowance ? (
                      <>
                        <dt>Baggage</dt>
                        <dd>{flight.baggage_allowance}</dd>
                      </>
                    ) : null}
                  </dl>
                </div>

                <div className="reservation-card reservation-card--payment">
                  <h3>Payment summary</h3>
                  {paymentBreakdown.length ? (
                    <ul className="reservation-payment-list">
                      {paymentBreakdown.map((line) => (
                        <li key={line.label}>
                          <span>{line.label}</span>
                          <span>{line.value}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="reservation-muted">
                      Billing details will appear once pricing is finalized.
                    </p>
                  )}
                </div>
              </section>

              <section className="reservation-section">
                <h3>Passenger details</h3>
                {passengers.length ? (
                  <ul className="reservation-passenger-list">
                    {passengers.map((passenger, index) => (
                      <li key={passenger.email ?? index}>
                        <div className="reservation-passenger-header">
                          <span>{formatPassengerLabel(index)}</span>
                          {passenger?.name ? <strong>{passenger.name}</strong> : null}
                        </div>
                        <div className="reservation-passenger-meta">
                          {typeof passenger?.age === 'number' ? (
                            <span>Age {passenger.age}</span>
                          ) : null}
                          {passenger?.gender ? <span>{passenger.gender}</span> : null}
                          {passenger?.dob ? <span>DOB {passenger.dob}</span> : null}
                        </div>
                        {passenger?.email ? (
                          <div className="reservation-passenger-contact">{passenger.email}</div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="reservation-muted">Passenger details will appear once provided.</p>
                )}
              </section>

              <footer className="reservation-confirmation-footer">
                {paymentMessage ? (
                  <p className="reservation-payment-message">{paymentMessage}</p>
                ) : null}
                <button
                  type="button"
                  className="reservation-confirmation-pay"
                  onClick={handlePayment}
                  disabled={isProcessingPayment}
                >
                  {isProcessingPayment ? 'Processing…' : 'Confirm & Pay'}
                </button>
              </footer>
            </>
          ) : (
            <div className="reservation-confirmation-status">
              No reservation data found for this link.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default ReservationConfirmationPage;
