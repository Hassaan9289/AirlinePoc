import { Fragment, useMemo, useState } from 'react';

import './SeatMap.css';

const STATUS_LABELS = {
  available: 'Available',
  selected: 'Selected',
  booked: 'Booked',
  held: 'Held',
  pending: 'Pending confirmation',
};

const STATUS_ORDER = ['available', 'selected', 'held', 'pending', 'booked'];

const formatSeatTooltip = (seat, isSelected) => {
  const label = STATUS_LABELS[seat.status] ?? seat.status;
  const traits = [];
  if (seat.type === 'window') {
    traits.push('Window');
  } else if (seat.type === 'aisle') {
    traits.push('Aisle');
  } else if (seat.type === 'middle') {
    traits.push('Middle');
  }
  if (seat.extra?.legroom) {
    traits.push('Extra legroom');
  }
  if (seat.extra?.exitRow) {
    traits.push('Exit row');
  }
  const details = [label, ...traits];
  if (isSelected) {
    details.unshift('Selected seat');
  }
  return `${seat.id}${details.length ? ` · ${details.join(' · ')}` : ''}`;
};

const groupLegend = (sections, selectedSeatIds) => {
  const counts = STATUS_ORDER.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  sections.forEach((section) => {
    section.rows.forEach((row) => {
      row.seats.forEach((seat) => {
        const status =
          selectedSeatIds.has(seat.id) && seat.status === 'available'
            ? 'selected'
            : seat.status;
        if (counts[status] !== undefined) {
          counts[status] += 1;
        }
      });
    });
  });

  return STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status,
    label: STATUS_LABELS[status] ?? status,
    count: counts[status],
  }));
};

const cx = (...input) => {
  const classes = [];
  input.forEach((value) => {
    if (!value) {
      return;
    }
    if (typeof value === 'string') {
      classes.push(value);
    } else if (Array.isArray(value)) {
      const nested = cx(...value);
      if (nested) {
        classes.push(nested);
      }
    } else if (typeof value === 'object') {
      Object.entries(value).forEach(([key, condition]) => {
        if (condition) {
          classes.push(key);
        }
      });
    }
  });
  return classes.join(' ');
};

const SeatLegend = ({ sections, selectedSeatIds }) => {
  const legend = useMemo(
    () => groupLegend(sections, selectedSeatIds),
    [sections, selectedSeatIds],
  );

  if (!legend.length) {
    return null;
  }

  return (
    <div className="seat-map__legend">
      {legend.map((item) => (
        <span
          key={item.status}
          className={cx('seat-map__legend-item', `seat-map__legend-item--${item.status}`)}
        >
          <span className="seat-map__legend-swatch" aria-hidden />
          <span className="seat-map__legend-label">
            {item.label}
            <span className="seat-map__legend-count">({item.count})</span>
          </span>
        </span>
      ))}
    </div>
  );
};

const SeatConfirmationDialog = ({
  open,
  onClose,
  onConfirm,
  selectedSeatIds,
  isSyncing,
}) => {
  if (!open) {
    return null;
  }
  return (
    <div className="seat-map__dialog-backdrop" role="presentation">
      <div
        className="seat-map__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="seat-map-confirmation-title"
      >
        <h4 id="seat-map-confirmation-title">Confirm seats</h4>
        <p className="seat-map__dialog-subtitle">
          Please verify your selection before saving.
        </p>
        <div className="seat-map__dialog-selection">
          {selectedSeatIds.length ? (
            <ul>
              {selectedSeatIds.map((seatId) => (
                <li key={seatId}>{seatId}</li>
              ))}
            </ul>
          ) : (
            <p>No seats selected yet.</p>
          )}
        </div>
        <div className="seat-map__dialog-actions">
          <button
            type="button"
            className="seat-map__dialog-button seat-map__dialog-button--secondary"
            onClick={onClose}
            disabled={isSyncing}
          >
            Cancel
          </button>
          <button
            type="button"
            className="seat-map__dialog-button seat-map__dialog-button--primary"
            onClick={() => onConfirm(selectedSeatIds)}
            disabled={!selectedSeatIds.length || isSyncing}
          >
            {isSyncing ? 'Saving…' : 'Confirm seats'}
          </button>
        </div>
      </div>
    </div>
  );
};

const SeatMap = ({
  seatMap,
  selectedSeats = [],
  onSeatToggle,
  onConfirmSelection,
  isSyncing = false,
  syncError = '',
}) => {
  const [showDialog, setShowDialog] = useState(false);
  const selectedSeatIds = useMemo(
    () => new Set((selectedSeats ?? []).map((seat) => seat.toUpperCase())),
    [selectedSeats],
  );
  const sections = seatMap?.sections ?? [];
  const meta = seatMap?.meta ?? {};

  const handleSeatClick = (seat) => {
    if (isSyncing || !onSeatToggle) {
      return;
    }
    const normalized = seat.id.toUpperCase();
    if (seat.status !== 'available' && !selectedSeatIds.has(normalized)) {
      return;
    }
    onSeatToggle(normalized, seat);
  };

  const handleConfirm = () => {
    if (!onConfirmSelection) {
      return;
    }
    setShowDialog(true);
  };

  const handleConfirmDialog = (seatIds) => {
    onConfirmSelection(seatIds);
    setShowDialog(false);
  };

  const sortedSelected = useMemo(
    () => Array.from(selectedSeatIds.values()).sort(),
    [selectedSeatIds],
  );

  return (
    <div className="seat-map">
      <header className="seat-map__header">
        <div>
          <h3>Seat selection</h3>
          <p>
            Pick your preferred seats from the cabin layout below. Hover to see seat details and click to toggle selection.
          </p>
        </div>
        <div className="seat-map__meta">
          {typeof meta.availableSeats === 'number' ? (
            <span>
              <strong>{meta.availableSeats}</strong> available
            </span>
          ) : null}
          {typeof meta.bookedSeats === 'number' ? (
            <span>
              <strong>{meta.bookedSeats}</strong> booked
            </span>
          ) : null}
        </div>
      </header>

      <SeatLegend sections={sections} selectedSeatIds={selectedSeatIds} />

      {syncError ? (
        <div className="seat-map__error" role="status">
          {syncError}
        </div>
      ) : null}

      <div className="seat-map__sections" role="list">
        {sections.map((section) => (
          <section
            key={section.id}
            className="seat-map__section"
            aria-label={section.label}
          >
            <header className="seat-map__section-header">
              <h4>{section.label}</h4>
              {section.subtitle ? <span>{section.subtitle}</span> : null}
            </header>
            <div className="seat-map__grid" role="group">
              {section.rows.map((row) => (
                <Fragment key={row.id ?? row.label}>
                  <div className="seat-map__row-label" aria-hidden>
                    {row.label}
                  </div>
                  <div className="seat-map__row">
                    {row.seats.map((seat) => {
                      const normalized = seat.id.toUpperCase();
                      const isSelected = selectedSeatIds.has(normalized);
                      const isUnavailable =
                        seat.status !== 'available' && !isSelected;
                      return (
                        <button
                          key={seat.id}
                          type="button"
                          className={cx(
                            'seat-map__seat',
                            `seat-map__seat--${seat.status}`,
                            {
                              'seat-map__seat--selected': isSelected,
                              'seat-map__seat--syncing': isSyncing && isSelected,
                              'seat-map__seat--unavailable': isUnavailable,
                              'seat-map__seat--window': seat.type === 'window',
                              'seat-map__seat--aisle': seat.type === 'aisle',
                            },
                          )}
                          onClick={() => handleSeatClick(seat)}
                          disabled={isUnavailable || isSyncing}
                          data-tooltip={formatSeatTooltip(seat, isSelected)}
                          aria-pressed={isSelected}
                          aria-label={formatSeatTooltip(seat, isSelected)}
                        >
                          <span>{seat.display ?? seat.id}</span>
                        </button>
                      );
                    })}
                  </div>
                </Fragment>
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="seat-map__footer">
        <div className="seat-map__selection">
          <span>Selected seats:</span>
          {sortedSelected.length ? (
            <ul>
              {sortedSelected.map((seatId) => (
                <li key={seatId}>{seatId}</li>
              ))}
            </ul>
          ) : (
            <span className="seat-map__selection-empty">None</span>
          )}
        </div>
        {onConfirmSelection ? (
          <button
            type="button"
            className="seat-map__confirm"
            onClick={handleConfirm}
            disabled={isSyncing || !sortedSelected.length}
          >
            {isSyncing ? 'Saving selection…' : 'Confirm selection'}
          </button>
        ) : null}
      </footer>

      <SeatConfirmationDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConfirm={handleConfirmDialog}
        selectedSeatIds={sortedSelected}
        isSyncing={isSyncing}
      />
    </div>
  );
};

export default SeatMap;
