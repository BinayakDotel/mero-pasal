import { v } from "convex/values";
import { memberMutation } from "./lib/functions";

// ADR-010: all photo storage goes through this module, so it could move to R2/S3 later.

/** F-03: a short-lived signed URL the phone POSTs one image to; the response holds its storageId. */
export const generateUploadUrl = memberMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
});
