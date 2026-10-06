# Android Chromium contact delivery

The Android Playwright project explicitly enables Chromium
`SyntheticPointerActions`. The shared campaign driver and the original
multi-touch smoke case use the same CDP contact rules:

- `touchStart` begins the first contact only.
- `touchMove` sends the complete active set, including newly added fingers.
- Omitting a finger from that active set releases only that finger.
- Empty `touchEnd` releases every remaining contact.

This keeps a real shield finger down while look gestures finish and restart.
The earlier combination of `touchStart` for additional fingers and `touchMove`
for partial release mixed two incompatible Chromium implementations. In the
legacy implementation, omitted move points remain held. In the synthetic
implementation, another `touchStart` while a contact is held is invalid.

Primary implementation references for the Playwright-pinned Chromium
140.0.7339.186:

- [Implementation selection](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/devtools/protocol/input_handler.cc#L1598)
- [Synthetic validation and contact updates](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/devtools/protocol/input_handler.cc#L1712)
- [Legacy event construction](https://github.com/chromium/chromium/blob/140.0.7339.186/content/browser/devtools/protocol/input_handler.cc#L466)

The feature is selected explicitly rather than inferred from upstream defaults
or a previous runner. These are browser-generated touch inputs, not injected
DOM events or game actions. Rendering flags and desktop keyboard behavior are
unchanged. Emulation does not certify Android hardware or iPhone Safari.

Static/type discovery can establish that this contract is wired correctly;
successful real browser execution must be recorded separately. This executor
did not retry its known Chromium launch socket EPERM and claims no browser pass.
