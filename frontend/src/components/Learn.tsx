export default function Learn() {
  return (
    <section className="panel learn">
      <h2>Why is the lunar south pole so hard?</h2>
      <div className="learn-grid">
        <div>
          <h3>☀️ The Sun never climbs</h3>
          <p>
            The Moon's spin axis is tilted only <b>1.5°</b>. At the pole the Sun circles the horizon once a month and
            never rises more than about 1.5° above it. A hill 100 m tall a few kilometres away can decide between day
            and night.
          </p>
        </div>
        <div>
          <h3>🏔️ Terrain is everything</h3>
          <p>
            Crater rims and ridges catch sunlight for most of the year, while crater floors a few kilometres away have
            not seen the Sun in billions of years. That makes them cold traps for <b>water ice</b>, but deadly for
            solar-powered landers.
          </p>
        </div>
        <div>
          <h3>🌍 Earth wobbles in the sky</h3>
          <p>
            From the near side, Earth hangs almost fixed in the sky. Libration (the Moon's monthly wobble) makes it
            bob up and down by ~7°. Near the pole Earth sits just above the horizon, so it regularly drops behind
            terrain, cutting direct communication.
          </p>
        </div>
        <div>
          <h3>📅 Dates matter as much as places</h3>
          <p>
            Because both Sun and Earth skim the horizon, a two-week launch slip can turn a great site into a poor
            one. Try <b>Compare</b>: the same site, 14 days apart, can differ by tens of percentage points.
          </p>
        </div>
      </div>
      <h2>How Horizon404 computes this</h2>
      <ol className="method">
        <li>
          <b>Sun & Earth positions</b> from the JPL DE421 ephemeris and NASA/NAIF lunar orientation kernels
          (libration included), validated against <b>JPL Horizons</b> to 0.00001°.
        </li>
        <li>
          <b>Terrain skyline</b> from the LRO <b>LOLA</b> south-pole elevation model (120 m/pixel): 720 rays out to
          200 km, exact geometry on a curved Moon, no atmosphere.
        </li>
        <li>
          <b>Visibility</b>: the fraction of the solar disk above the skyline drives power, and Earth's centre above
          the skyline means direct-to-Earth communication. Both at once is the headline number.
        </li>
        <li>
          Sites north of 75°S use a smooth horizon (outside the polar elevation model). Values are for a 2 m mast by
          default.
        </li>
      </ol>
    </section>
  )
}
