# Simulation model and calibration gaps

This is an original deterministic **game approximation**, not a digital twin of a commercial stadium. It must not be described as reproducing real BEYBLADE X physics. Factual official marketing ratings and model constants are separate in `catalog.ts`. No manufacturer rating is a measured mass, friction coefficient, inertia tensor, elasticity or burst torque.

## Implemented mechanics

- Shared, DOM-free fixed-step integrator at 240 Hz, with four deterministic contact substeps (960 Hz). Battle state is JSON-serializable; there is no random winner selection, hidden simulation cache or client-authoritative collision result.
- Rounded radial-outline rigid-body contact proxies, with small type-dependent lobe counts/depths: mass-weighted nonpenetration, restitution impulse, Coulomb tangential friction, and angular torque. Free-contact linear momentum is conserved; restitution and friction do not create kinetic energy.
- Bowl potential, gravity-like inward force, damped planar motion and spin-dependent friction. Inclined-tip friction couples rotational energy to orbital translation. Spin eventually reaches zero. A low positive RPM or tilt alone is never a Spin Finish; a stop/reversal of the original rotation is latched even if a later substep contact could restart it.
- Damped tilt/wobble driven by a low-spin stability surrogate. This is **not** a full gyroscopic 6-DOF/precession/contact-patch solver. The visual phase is integrated angular velocity, not a measured blade contact waveform.
- Wall reflection and rail no-slip impulse transfer rotational energy into translation while losing, not creating, total kinetic energy. The lever arm is a separate estimated bit pitch radius (`gearRadius`), not the blade radius. Engagement requires radial gear reach, eligible bit gearing, a tilt limit and overlap with the modeled rail height band. Rail grip, pitch, height band and cooldown are uncalibrated game estimates, not actual gear-tooth geometry.
- Burst lock accumulates release-direction torque and a small normal-impact component, weighted by a type-dependent body-relative contact-exposure surrogate, and slowly relaxes. This orientation model avoids assigning equal generic damage to both tops; mirrored inputs retain mirrored outcomes. Crossing the estimated threshold produces burst; there is no probability roll. No claim is made that this surrogate represents actual locking teeth, ratchet contact or wear.
- Explicit Xtreme and two Over pocket geometry. The entire conservative body envelope must enter. Pocket entry remains provisional while motion could return the top; a whole-body return cancels it. Settling uses a game threshold (speed below 0.055 m/s for 0.12 s). The earlier provisional timestamp is retained when settled; a later finish cannot override it. First events within one contact substep tie (about 1.04 ms numerical resolution, not an official simultaneity tolerance).

## Geometry and units

Positions: metres; time: seconds; mass: kilograms; spin: radians/second. `STADIUM` exposes the **model's** 0.22 m play radius and pocket layout (Xtreme angle 0, Over ±120 degrees) for rendering. These are not a scanned official stadium. The default 35 g mass, 24 mm radius and inertia scaling are placeholder estimates shared by currently unmeasured builds. Product codes such as ratchet `4-60` are not SI measurements.

## Rules source

The official Japanese [12th edition regulations](https://beyblade.takaratomy.co.jp/beyblade-x/_image/regulation.pdf), effective 2026-03-13, specify Spin 1, Over 2, Burst 2 and Xtreme 3 points, first occurrence priority and simultaneous-finish relaunches. This core implements two-top finish arbitration; tournament/deck progression belongs in the rules and server layers. A real judge can make rulings the game cannot reproduce.

## Known omissions / validation needed

Real-world equivalence is **not validated**. Needed measurements include assembled mass and inertia by part, precise surfaces/gears/pockets, launch angular and translational velocity distributions, static/dynamic friction by bit and stadium surface, collision restitution and blade geometry, spring/locking disengagement torque, wear, full tilt/yaw/angular momentum, airborne trajectories and ceiling impacts. CX component-specific inertia and transforming parts, Bullet Griffon's released bullet, metal-contact asymmetry and real launcher mechanisms are not physically modeled. A catalog entry alone does not imply its mechanical gimmick has been modeled.

Calibration should fit high-speed video and instrumented tests on held-out matchups, reporting uncertainty rather than treating marketing attack/defense/stamina scores as physical constants. The existing unit tests establish **software invariants only**, never equivalence with a real toy.

## Verification

`npx vitest run tests/unit/beyblade/physics.test.ts` covers replay determinism, finite-state input guards, isolated dissipation, contact momentum/energy, rail energy transfer, whole-body pocket admission, cancellation, finish types, first-event priority, simultaneous draws and eventual termination. Tests run against synthetic profiles so tests do not misrepresent factual manufacturer measurements.

The radial lobe proxy changes contact distance but is not exact polygon/CAD collision detection and does not solve the true surface-gradient normal of each physical blade. Bit pitch defaults to an estimated 6 mm and gear height to 7 mm; rail model radius is 0.201 m, height band 3–12 mm, tilt limit 0.55 rad. None are manufacturer measurements.
