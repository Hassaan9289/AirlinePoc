
import React, { useState } from "react";

/* ---------- local CSS (inlined for single-file use) ---------- */
const styles = `
:root{
  --bg:#f6f7f8;--card:#fff;--border:#e5e7eb;--text:#111827;--muted:#6b7280;
  --primary:#d32f2f;--primary-600:#b71c1c;--radius:12px;
  --shadow:0 1px 2px rgba(16,24,40,.04),0 4px 12px rgba(16,24,40,.06);
}
*{box-sizing:border-box}
html,body,#root{height:100%}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,"Noto Sans";
  background:var(--bg);color:var(--text)}
.sr-only{position:absolute;left:-10000px;top:auto;width:1px;height:1px;overflow:hidden}
.muted{color:var(--muted)} .small{font-size:.875rem}
.link{background:none;border:0;padding:0;font:inherit;color:#2563eb;cursor:pointer;text-decoration:underline}
.btn{border-radius:10px;border:1px solid var(--border);padding:.625rem .9rem;background:#fff;font-weight:600;cursor:pointer;transition:all .15s ease}
.btn:hover{box-shadow:var(--shadow)}
.btn.small{padding:.45rem .65rem;font-size:.875rem}
.btn.ghost{background:transparent}
.btn.outline{background:transparent}
.btn.primary{background:var(--primary);color:#fff;border-color:var(--primary)}
.btn.primary:hover{background:var(--primary-600);border-color:var(--primary-600)}
.btn[disabled],.btn[aria-disabled="true"]{opacity:.6;cursor:not-allowed;box-shadow:none}
.booking-page{max-width:1200px;margin:24px auto;padding:8px 16px 40px}
.trip-summary{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;box-shadow:var(--shadow);margin-bottom:16px}
.chip-group{display:flex;gap:10px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:8px;background:#f3f4f6;border:1px solid var(--border);border-radius:999px;padding:6px 10px}
.chip .arrow{opacity:.6}
.avatar-chip{background:#e5e7eb;border-radius:999px;padding:6px 10px;font-weight:700;letter-spacing:.02em}
.right-actions{display:flex;align-items:center;gap:10px}
.grid-3{display:grid;grid-template-columns:1.25fr 1fr .9fr;gap:16px}
@media (max-width:1024px){.grid-3{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
/* Flight card */
.flight-card{padding:12px}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.card-title{font-weight:700}
.flight-main{display:flex;gap:16px;padding:10px 6px}
.airline{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:64px}
.logo{width:32px;height:32px;border-radius:8px;background:#fee2e2;color:#b91c1c;display:grid;place-items:center;font-weight:800}
.code{font-size:.875rem;color:var(--muted)}
.route{flex:1}
.from-to{display:flex;align-items:center;gap:10px}
.from-to .city{font-weight:700;font-size:1.1rem}
.from-to .line{flex:1;border-bottom:1px dashed #d1d5db;display:flex;align-items:center;justify-content:center;color:#9ca3af}
.meta{display:flex;align-items:flex-start;justify-content:space-between;margin-top:8px}
.time{font-size:1.1rem;font-weight:700}
.duration{display:grid;place-items:center;font-weight:600;color:#374151}
.card-foot{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:12px;padding:10px 6px;border-top:1px dashed #e5e7eb;margin-top:8px}
.fare-type{color:#374151}
.fare{justify-self:end;font-weight:800}
/* Additional services */
.services-card{padding:12px}
.service{border-top:1px dashed #e5e7eb;padding-top:10px;margin-top:10px}
.service:first-of-type{border-top:none;padding-top:0;margin-top:0}
.service-head{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.icon{font-size:1.05rem}
.accordion{border:1px solid #ebecef;border-radius:10px;overflow:hidden}
.acc-head{width:100%;text-align:left;background:#f9fafb;border:0;border-bottom:1px solid #ebecef;padding:10px 12px;font-weight:600;display:flex;align-items:center;justify-content:space-between;cursor:pointer}
.acc-head:last-of-type{border-bottom:0}
.acc-body{padding:10px 12px;background:#fff}
.row{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center}
.seat,.price{font-weight:700}
.chevron{transition:transform .15s ease}
.chevron.open{transform:rotate(180deg)}
.service-actions{display:flex;justify-content:flex-end;margin-top:12px}
/* Summary card */
.summary-card{overflow:hidden}
.summary-hero{height:120px;background:
  linear-gradient(180deg, rgba(0,0,0,.15), rgba(0,0,0,0)),
  url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="720" height="240"><rect width="100%" height="100%" fill="%23f3f4f6"/><circle cx="580" cy="110" r="60" fill="%23d1d5db"/><rect x="24" y="24" width="120" height="80" rx="8" fill="%23e5e7eb"/></svg>') center/cover no-repeat}
.summary-body{padding:12px}
.section{border-bottom:1px dashed #e5e7eb;padding-bottom:10px;margin-bottom:10px}
.row.between{display:flex;justify-content:space-between;align-items:center}
.line{display:flex;justify-content:space-between;align-items:center;color:#374151;margin:.25rem 0}
.fees{border-bottom:1px dashed #e5e7eb;padding-bottom:10px;margin-bottom:10px}
.to-pay{display:flex;align-items:center;justify-content:space-between;margin:8px 0}
.to-pay .title{color:#b45309;font-weight:700}
.to-pay .amount{font-weight:900;font-size:1.35rem}
.agree{display:flex;align-items:flex-start;gap:8px;font-size:.9rem;margin:12px 0}
.agree input{margin-top:.2rem}
.summary-actions{display:flex;align-items:center;justify-content:space-between;margin-top:8px}
`;

/* ---------- helpers & tiny icons ---------- */
const formatINR = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

const Plane = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
    <path
      fill="currentColor"
      d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9L2 14v2l8-2.5V19l-2 1v1l3-.5l3 .5v-1l-2-1v-5.5z"
    />
  </svg>
);
const Chevron = ({ open }) => (
  <span className={`chevron ${open ? "open" : ""}`} aria-hidden>
    ▾
  </span>
);

/* ---------- subcomponents (in-file) ---------- */
const FlightCard = ({
  title,
  flightNo,
  from,
  to,
  date,
  departTime,
  arriveTime,
  duration,
  fareType,
  fare,
}) => (
  <article className="card flight-card">
    <div className="card-head">
      <div className="card-title">{title}</div>
      <button className="link">View All Flights</button>
    </div>

    <div className="flight-main">
      <div className="airline">
        <div className="logo">AI</div>
        <div className="code">{flightNo}</div>
      </div>

      <div className="route">
        <div className="from-to">
          <div className="city">{from}</div>
          <div className="line">
            <Plane />
          </div>
          <div className="city">{to}</div>
        </div>

        <div className="meta">
          <div>
            <div className="muted">{date}</div>
            <div className="time">{departTime}</div>
          </div>
          <div className="duration">{duration}</div>
          <div>
            <div className="muted">{date}</div>
            <div className="time">{arriveTime}</div>
          </div>
        </div>
      </div>
    </div>

    <div className="card-foot">
      <div className="fare-type">{fareType}</div>
      <button className="btn small outline">Change Fare Type / Class ▾</button>
      <div className="fare">{formatINR(fare)}</div>
    </div>
  </article>
);

const AdditionalServices = ({ seatFee = 375 }) => {
  const [openTop, setOpenTop] = useState(true);
  const [openBottom, setOpenBottom] = useState(false);

  return (
    <div className="card services-card">
      <div className="card-title">Additional Services</div>

      <div className="service">
        <div className="service-head">
          <span className="icon" aria-hidden>
            🪑
          </span>
          <strong>Seat selection</strong>
        </div>

        <div className="accordion">
          <button
            className="acc-head"
            onClick={() => setOpenTop((v) => !v)}
            aria-expanded={openTop}
          >
            <span>DEL → BOM</span>
            <Chevron open={openTop} />
          </button>
          {openTop && (
            <div className="acc-body">
              <div className="row">
                <div className="passenger">MATHEW AUGU…</div>
                <div className="seat">
                  6F <span className="muted">(Window)</span>
                </div>
                <div className="price">{formatINR(seatFee)}</div>
              </div>
            </div>
          )}

          <button
            className="acc-head"
            onClick={() => setOpenBottom((v) => !v)}
            aria-expanded={openBottom}
          >
            <span>BOM → DEL</span>
            <Chevron open={openBottom} />
          </button>
          {openBottom && (
            <div className="acc-body">
              <div className="row">
                <div className="passenger">MATHEW AUGU…</div>
                <div className="seat">
                  6F <span className="muted">(Window)</span>
                </div>
                <div className="price">{formatINR(seatFee)}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="service">
        <div className="service-head">
          <span className="icon" aria-hidden>
            🧑‍🦽
          </span>
          <strong>Special assistance</strong>
        </div>
        <p className="muted small">
          Add wheelchair, medical, or other assistance after booking if
          required.
        </p>
      </div>

      <div className="service-actions">
        <button className="btn">Modify Seat</button>
      </div>
    </div>
  );
};

const SummaryCard = ({ depFare, retFare, seatFeePerLeg, convenienceFee }) => {
  const leg1Total = depFare + seatFeePerLeg;
  const leg2Total = retFare + seatFeePerLeg;
  const grand = leg1Total + leg2Total + convenienceFee;
  const [agree, setAgree] = useState(false);

  return (
    <div className="card summary-card">
      <div className="summary-hero" role="img" aria-label="Booking Summary" />
      <div className="summary-body">
        <div className="section">
          <div className="row between">
            <strong>DEL → BOM</strong>
            <strong>{formatINR(leg1Total)}</strong>
          </div>
          <div className="line">
            <span className="muted">Flight Fare</span>
            <span>{formatINR(depFare)}</span>
          </div>
          <div className="line">
            <span className="muted">Additional Services</span>
            <span>{formatINR(seatFeePerLeg)}</span>
          </div>
        </div>

        <div className="section">
          <div className="row between">
            <strong>BOM → DEL</strong>
            <strong>{formatINR(leg2Total)}</strong>
          </div>
          <div className="line">
            <span className="muted">Flight Fare</span>
            <span>{formatINR(retFare)}</span>
          </div>
          <div className="line">
            <span className="muted">Additional Services</span>
            <span>{formatINR(seatFeePerLeg)}</span>
          </div>
        </div>

        <div className="fees">
          <div className="line">
            <span className="muted">Convenience Fee (Non‑Refundable)</span>
            <span>{formatINR(convenienceFee)}</span>
          </div>
        </div>

        <div className="to-pay">
          <div className="title">Price to be paid</div>
          <div className="amount">{formatINR(grand)}</div>
        </div>

        <label className="agree">
          <input
            type="checkbox"
            checked={agree}
            onChange={(e) => setAgree(e.target.checked)}
          />
          <span>
            I read and agree <a href="#fare-rules">Fare Rules</a>,{" "}
            <a href="#tnc">T&amp;C of Carriage</a> including{" "}
            <a href="#dangerous-goods">Dangerous Goods policy</a>
          </span>
        </label>

        <div className="summary-actions">
          <a href="#booking-details" className="link">
            Booking Details
          </a>
          <button className="btn primary" disabled={!agree} aria-disabled={!agree}>
            Confirm &amp; Pay
          </button>
        </div>
      </div>
    </div>
  );
};

/* ---------- the page ---------- */
export default function BookingPage() {
  // static data to match the screen
  const departure = {
    title: "Departure",
    flightNo: "AI 678",
    from: "DEL",
    to: "BOM",
    date: "Thu, 23 Jan 25",
    departTime: "09:00",
    arriveTime: "10:55",
    duration: "1h 55m",
    fareType: "Economy | Flex",
    fare: 7162,
  };

  const ret = {
    title: "Return",
    flightNo: "AI 2928",
    from: "BOM",
    to: "DEL",
    date: "Sun, 26 Jan 25",
    departTime: "06:30",
    arriveTime: "08:40",
    duration: "2h 10m",
    fareType: "Economy | Flex",
    fare: 7922,
  };

  const seatFeePerLeg = 375;
  const convenienceFee = 399;

  return (
    <main className="booking-page">
      {/* inject local CSS */}
      <style>{styles}</style>

      {/* top chips */}
      <header className="trip-summary" aria-label="Trip summary">
        <div className="chip-group">
          <div className="chip">
            <strong>Departure</strong>
            <span>Thu, 23 Jan 25</span>
            <span className="arrow" aria-hidden>
              →
            </span>
            <span>Delhi (DEL)</span>
            <span className="arrow" aria-hidden>
              →
            </span>
            <span>Mumbai (BOM)</span>
          </div>

          <div className="chip">
            <strong>Return</strong>
            <span>Sun, 26 Jan 25</span>
            <span className="arrow" aria-hidden>
              →
            </span>
            <span>Mumbai (BOM)</span>
            <span className="arrow" aria-hidden>
              →
            </span>
            <span>Delhi (DEL)</span>
          </div>
        </div>

        <div className="right-actions">
          <div className="avatar-chip" title="Passenger">
            MATHE…
          </div>
          <button className="btn ghost">Modify Details</button>
        </div>
      </header>

      {/* 3-column layout */}
      <div className="grid-3">
        <section aria-labelledby="flights">
          <h2 id="flights" className="sr-only">
            Selected flights
          </h2>
          <FlightCard {...departure} />
          <FlightCard {...ret} />
        </section>

        <section aria-labelledby="services">
          <h2 id="services" className="sr-only">
            Additional services
          </h2>
          <AdditionalServices seatFee={seatFeePerLeg} />
        </section>

        <aside aria-labelledby="summary">
          <h2 id="summary" className="sr-only">
            Booking summary
          </h2>
          <SummaryCard
            depFare={departure.fare}
            retFare={ret.fare}
            seatFeePerLeg={seatFeePerLeg}
            convenienceFee={convenienceFee}
          />
        </aside>
      </div>
    </main>
  );
}

