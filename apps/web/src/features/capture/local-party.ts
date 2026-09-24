/** Names added on this phone that the server doesn't know yet carry this id prefix. */
export const LOCAL_PREFIX = "local:";
export const isLocalParty = (p: { _id: string }) => p._id.startsWith(LOCAL_PREFIX);
