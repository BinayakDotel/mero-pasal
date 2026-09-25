/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as billAdmin from "../billAdmin.js";
import type * as billQueries from "../billQueries.js";
import type * as e2eSupport from "../e2eSupport.js";
import type * as files from "../files.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_billRow from "../lib/billRow.js";
import type * as lib_bills from "../lib/bills.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_ledger from "../lib/ledger.js";
import type * as lib_months from "../lib/months.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as memberAdmin from "../memberAdmin.js";
import type * as members from "../members.js";
import type * as parties from "../parties.js";
import type * as seed from "../seed.js";
import type * as summaries from "../summaries.js";
import type * as transactions from "../transactions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  billAdmin: typeof billAdmin;
  billQueries: typeof billQueries;
  e2eSupport: typeof e2eSupport;
  files: typeof files;
  "lib/audit": typeof lib_audit;
  "lib/billRow": typeof lib_billRow;
  "lib/bills": typeof lib_bills;
  "lib/errors": typeof lib_errors;
  "lib/functions": typeof lib_functions;
  "lib/ledger": typeof lib_ledger;
  "lib/months": typeof lib_months;
  "lib/permissions": typeof lib_permissions;
  memberAdmin: typeof memberAdmin;
  members: typeof members;
  parties: typeof parties;
  seed: typeof seed;
  summaries: typeof summaries;
  transactions: typeof transactions;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
