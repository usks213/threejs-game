# ADR 0017: Durable room administration and access recovery

Status: implemented and tested locally. Public deployment and browser interaction validation are separate gates.

## Identity and scope

The shared room binds a connection to the SHA-256 public ID derived from its private resume capability. The authenticator returns that ID separately from the normalized packet; AuthorityRoom rejects a hello claiming its own public identity without the trusted authentication argument. The first successfully persisted admission of a newly created room becomes its administrator. An existing checkpoint without management metadata migrates to an unclaimed but **non-claimable** room, so a new visitor cannot acquire old-room powers.

Room access contains a version, administrator public ID, explicit initial claim eligibility, join lock, known identities, banned identities, monotonically increasing revision and bounded administration receipts. It contains no resume keys. Known identities and bans are limited to 256. Legacy worlds and recorded members are not deleted to satisfy the new budget.

A lock rejects unknown identities while allowing recorded participants to reconnect. Kick terminates the selected connection but permits deliberate manual re-entry. Ban terminates it and rejects the same saved identity; unban restores access to that identity's existing member record. Inventory, creator ownership, buildings and world state are retained. The administrator cannot kick or ban themself. There is no implicit administrator transfer or reclaim mechanism.

This is anonymous capability authentication, not a verified human account system. A banned person could generate a different identity in an unlocked room. The confirmation UI explains that the administrator must also lock new participation to reject unknown IDs.

## Protocol and visibility

A room-admin request has a command ID, expected access revision, operation and optional target public ID. Permission comes exclusively from the authenticated connection. Extra owner/administrator fields are rejected. Receipts occupy a separate namespace from ordinary game actions and bind the complete administrative request; reusing an ID for a different effect is rejected. A saved replay returns its result without repeating the kick or ban. A retired receipt cannot bypass the expected revision check.

The room-access view exposes only locked, canManage, revision, pending and readOnly to a normal participant. The administrator additionally receives public target IDs and online/banned status. This metadata is not included in portable WorldSave exports. The client retains an unacknowledged administrative command with the same ID across reconnection. Kick, ban and new-participant-lock close reasons stop automatic reconnection loops.

## Persist before acknowledgement

An admission or administrative change stages a candidate access state. The authority pauses simulation steps, neutralizes current movement, ignores new input and rejects gameplay actions while that short transaction is pending. Clients stop local input prediction while management is pending. No administrator welcome, successful administrative ACK or target disconnection occurs until persistence completes.

If a write fails, its remote outcome may already have committed. The room becomes read-only, closes connections and reloads durable state rather than guessing a rollback or sending a false success/failure result. An unacknowledged request can then be resolved using the durable receipt. The CheckpointQueue tests cover both the delayed-success and rejection paths.

## Access cannot roll back with world recovery

A compact checksummed room-access record is stored independently of the current/previous world generations. The Worker writes access and its world checkpoint in the same storage transaction. Recovery of a previous world overlays the latest valid access, so restoring an older world cannot silently lift a ban. A newer checkpoint paired with stale access is rejected. A corrupt access record fails closed. The checkpoint manifest records accessRevision so a missing compact record is not mistaken for a legacy unmanaged room.

The Node harness uses an atomic compact-file rename before replacing an existing world file. A brand-new room first writes its initial checkpoint so an access record is never the sole surviving artifact. Partial failures stop the room and reload its durable result. The compact access record is deliberately not garbage-collected with world generations.

## Evidence and remaining gates

Local tests cover first admission, no pre-persistence welcome/ACK, legacy non-claimability, claimed-ID spoofing, unauthorized commands, stale revisions, self-ban rejection, replay identity binding, lock/known reconnect, inventory and building preservation, kick replay, uncertain outcomes, quota failure, corrupt/deleted compact metadata, previous-world recovery retaining ban/receipt, and client stop/replay behaviour. A real two-WebSocket test performs lock, ban, process restart, unban to the same possessions, kick and manual re-entry. The existing real-socket edit/pickup/reconnect suite also passes.

This does not prove public hosting or browser/touch confirmation UX. It does not add human identity verification, ownership transfer, external moderation services or permission to delete a participant's data.
