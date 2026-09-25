"use client";

import { api } from "@mero-pasal/backend/convex/_generated/api";
import type { Id } from "@mero-pasal/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { PageHead } from "@/features/admin/admin-shell";
import { whenNpt } from "@/features/admin/format";
import {
  Button,
  cellClass,
  EmptyRow,
  inputClass,
  Panel,
  rowClass,
  SkeletonRows,
  Table,
  useShowError,
} from "@/features/admin/ui";
import { useMember } from "@/features/session/member-gate";
import { useConnection } from "@/features/sync/use-connection";

type Role = "owner" | "staff" | "admin";
const ROLES: [Role, string][] = [
  ["owner", "Owner"],
  ["staff", "Staff"],
  ["admin", "Admin"],
];
const COLUMNS = 7;

/** F-13 invite: an email, a name and a role. Linked the first time they sign in (ADR-034). */
function InviteForm() {
  const invite = useMutation(api.memberAdmin.invite);
  const showError = useShowError();
  const online = useConnection();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Panel title="Invite">
      <form
        className="grid gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          setDone(null);
          invite({ email, displayName: name, role })
            .then(() => {
              setDone(email.trim().toLowerCase());
              setEmail("");
              setName("");
            })
            .catch(showError)
            .finally(() => setBusy(false));
        }}
      >
        <div className="flex flex-wrap gap-2">
          <input
            aria-label="Email"
            type="email"
            required
            placeholder="Google email"
            className={`${inputClass} w-64`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            aria-label="Name"
            required
            placeholder="Name (e.g. Aama)"
            className={`${inputClass} w-44`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Role"
            className={inputClass}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            {ROLES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <Button type="submit" tone="primary" disabled={busy || !online}>
            Invite
          </Button>
        </div>
        <p className="text-[13px] text-ink-soft">
          They sign in with Google using this email; the invite links on their first sign-in. Anyone
          else who signs in sees "Not invited".
        </p>
        {done ? (
          <p role="status" className="font-semibold text-sale">
            Invited {done}. Send them the app link.
          </p>
        ) : null}
      </form>
    </Panel>
  );
}

/** F-13 members: role, access and each phone's sync health; invite by email. */
export default function AdminMembersPage() {
  const me = useMember();
  const members = useQuery(api.memberAdmin.list, {});
  const setRole = useMutation(api.memberAdmin.setRole);
  const setActive = useMutation(api.memberAdmin.setActive);
  const showError = useShowError();
  const online = useConnection();
  return (
    <>
      <PageHead title="Members" />
      <div className="grid gap-5.5">
        <Panel title="Members" aside={members ? String(members.length) : ""}>
          <Table head={["Member", "Email", "Role", "Last seen", "Last sync", "Waiting", ""]}>
            {members === undefined ? (
              <SkeletonRows columns={COLUMNS} rows={3} />
            ) : members.length === 0 ? (
              <EmptyRow columns={COLUMNS}>No members.</EmptyRow>
            ) : (
              members.map((m) => {
                const self = m._id === me.member._id;
                return (
                  <tr key={m._id} className={`${rowClass} ${m.active ? "" : "text-ink-soft"}`}>
                    <td className={`${cellClass} font-semibold`}>
                      {m.displayName}
                      {self ? <small className="ml-1.5 text-ink-soft">(you)</small> : null}
                    </td>
                    <td className={cellClass}>{m.email ?? "—"}</td>
                    <td className={cellClass}>
                      <select
                        aria-label={`Role of ${m.displayName}`}
                        className={`${inputClass} h-8`}
                        value={m.role}
                        disabled={self || !online}
                        onChange={(e) =>
                          setRole({
                            memberId: m._id as Id<"members">,
                            role: e.target.value as Role,
                          }).catch(showError)
                        }
                      >
                        {ROLES.map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className={cellClass}>
                      {!m.active ? "deactivated" : m.invited ? "invited" : whenNpt(m.lastSeenAt)}
                    </td>
                    <td className={cellClass}>{whenNpt(m.lastSyncAt)}</td>
                    <td className={`${cellClass} ${m.failed ? "font-bold text-bahi" : ""}`}>
                      {m.pending}
                      {m.failed ? ` · ${m.failed} failed` : ""}
                    </td>
                    <td className={`${cellClass} text-right`}>
                      {self ? null : m.active ? (
                        <Button
                          tone="danger"
                          className="h-8"
                          disabled={!online}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Deactivate ${m.displayName}? Their access ends now; their bills and history stay.`,
                              )
                            ) {
                              setActive({ memberId: m._id, active: false }).catch(showError);
                            }
                          }}
                        >
                          Deactivate
                        </Button>
                      ) : (
                        <Button
                          className="h-8"
                          disabled={!online}
                          onClick={() =>
                            setActive({ memberId: m._id, active: true }).catch(showError)
                          }
                        >
                          Reactivate
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </Table>
        </Panel>
        <InviteForm />
      </div>
    </>
  );
}
