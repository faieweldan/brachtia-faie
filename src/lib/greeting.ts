/**
 * What to call a student at the top of a message.
 *
 * Their own name, because every message from Brachtia is from a person to a
 * person. "Dear Student" is what an institution writes to a file, and it sat at
 * the top of the warmest message in the system - the one that says their room
 * is theirs.
 *
 * The first word of their name, which is the one people answer to. A full legal
 * name in a greeting reads like a summons: "Hi Nurul Aina binti Ahmad" is not
 * how anybody is spoken to, and it is the name that appears on the tenancy
 * agreement precisely because it is not the name they go by.
 *
 * "there" when there is no name. A greeting with a blank in it is worse than a
 * general one.
 */
export function firstName(fullName: string): string {
  return (fullName ?? "").trim().split(/\s+/)[0] ?? "";
}

export function greetingName(fullName: string): string {
  return firstName(fullName) || "there";
}
