# 6DOF mechanics, evidence and calibration limits

The first planar/scalar-tilt prototype was rejected as insufficient. This revision replaces its mechanics, not just its effects. **It is still an uncalibrated rigid-body approximation, not a verified digital twin.** Manufacturer attack/defense/stamina ratings remain factual catalog values; they are no longer converted into mass, inertia, friction, restitution or spin decay.

## Rigid-body state and integration

Each top has world COM position/velocity in three dimensions, a unit quaternion, world angular momentum, body inertia, and derived angular velocity `ω = R I_body⁻¹ Rᵀ L`. Gravity accelerates the COM vertically. Contact impulses change both linear momentum and angular momentum `ΔL = r × J`; actual support torque produces precession and lean. No prescribed tilt target, decorative wobble, hidden winner selection or speed multiplier is used.

The symmetric-top torque-free propagator preserves world angular momentum and rotational energy; asymmetric body inertia uses an iterative Lie midpoint update. Fixed public steps are 1/240 s with deterministic internal substeps limiting angular feature travel and translation. The quaternion, momenta, contact state and finish state are JSON-serializable. The authoritative server sends that same state to both clients.

## Contact and Xtreme Dash

* The bowl is a curved height field with its matching surface normal. Flat tips use a finite patch, while rounded/needle/taper proxies use rounded contact with a declared effective torsional patch radius. Coulomb slip, rolling resistance and body-floor contacts transfer/dissipate energy. Tilt changes the real contact position.
* Lobed blade geometry is transformed by the actual quaternion. Rounded-node contact proxies calculate three-dimensional off-center impulses. The visible outline comes from the shared geometry export, but the rounded contact manifold is **not exact CAD collision detection**.
* The low gear rail and the outer, higher cover wall are separate surfaces. The blade can overhang the bit's rail; an old single-radius wall clamp must not prevent the gear reaching the rail.
* The closed rail follows the official stadium's approximate topology: a rear inward notch and front Xtreme Zone flanked by two Over Zones. Gear contact constrains the tangential contact velocity using the actual transformed bit pitch radius and full effective contact mass. It converts spin energy into travel; release from the notch follows the contact geometry, not a scripted inward steering force. This is smooth pitch contact, not individually resolved gear-tooth phase/impact; visible teeth are an illustrative geometric proxy.
* Events distinguish gear engagement, release, an actual inward-travelling dash, collision and finish. UI speed, lean, traces and rail contact markers read solver state. A counted event alone is not proof of correct real-world behavior.

## Evidence versus estimates

Official primary sources inspected:

- [BX-17 manual](https://beyblade.takaratomy.co.jp/beyblade-x/manual/BX-17_manual.pdf#page=7), stadium assembly/operation diagram: gear/rail meshing and easier X Dash from a horizontal launch. The diagram establishes topology, **not dimensioned CAD**.
- [DranSword](https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx01.html): three uppercut blades and Flat bit.
- [HellScythe](https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx02.html): four smash blades and Taper bit.
- [WizardArrow](https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx03.html): two large circular blades and Ball bit.
- [KnightShield](https://beyblade.takaratomy.co.jp/beyblade-x/lineup/bx04.html): six defensive blades, damper description and Needle bit. The damper itself is not simulated as a measured spring assembly.

`src/beyblade/data/physical-estimates.ts` explicitly separates these qualitative observations from estimated dimensions/material constants. The DranSword leading/trailing bevel uses an estimated 1.5 mm ramp amplitude and dimensionless 0.25 skew to model the published uppercut mechanism, not a measured silhouette. The default 35 g mass, 24 mm nominal radius, 19 mm COM height, 6 mm gear pitch radius, tip radii, friction, inertia and damping are **not manufacturer measurements**. Only the four basic blade counts above are source-observed; other shapes use declared type archetypes. Ratchet product codes and marketing heights are not silently interpreted as SI measurements. Unknown factual physical parameters stay `null` in the downloadable catalog.

## Finish rules and limitations

The official Japanese [12th edition rules](https://beyblade.takaratomy.co.jp/beyblade-x/_image/regulation.pdf), effective 2026-03-13, specify Spin 1, Over 2, Burst 2 and Xtreme 3 points, first occurrence priority and simultaneous relaunches. Default play is two players, one bey, first to at least four points. Pocket catch surfaces are lower than the playing bowl, with gravity-driven entry and estimated containment. Whole-body zone entry is provisional while a return remains possible. Positive low RPM or lean alone does not count as Spin Finish.

Burst uses exposed lower-ratchet contacts and a directional quasistatic detent-energy estimate; generic blade impact is not accumulated as arbitrary damage. The release mechanism remains an estimate, not measured locking teeth, wear or a complete coupled multipart rigid-body assembly. No unsupported decorative breakup is used as evidence of simulated detachment. Product-specific transformations, Bullet Griffon's separate bullet, internal free-spinning parts, exact blade material/contact deformation, launcher mechanics and every catalog part's shape are not reproduced.

## Verification and reproducible trajectories

- Unit tests check torque-free momentum/energy, quaternion normalization, gravity/support torque, precession, off-center contact, gear energy transfer, shared geometry, deterministic replay and finish arbitration. These establish software/physics invariants, **not measured equivalence**.
- `npm run analyze:beyblade -- /tmp/beyblade-trajectories.json` runs a public-default matchup plus twelve ordinary launch cases across the four starter forms. It records actual positions/orientations, energy, speed, lean, gear/release/collision events, round outcome and the core source SHA-256. It never injects special positions or velocities to manufacture a dash.
- Browser tests verify real two-client authoritative quaternion/momentum snapshots, customization, interrupted flows, phone layout and online-unavailable behavior.

Before claiming faithful reproduction: obtain measured mass/inertia/geometry and launch distributions; fit contact and gear parameters against high-speed trajectories; compare held-out matchups, rail timing/speed, precession, rebound, finish rates and uncertainty. Public video frames without camera calibration are qualitative evidence, not millimetre/second ground truth.
