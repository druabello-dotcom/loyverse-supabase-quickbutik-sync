// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { executeEventType } from "./helper-functions/execute-event-type.js";

const MY_CUSTOM_WEBHOOK_SECRET = Deno.env.get("MY_CUSTOM_WEBHOOK_SECRET");

//—————————————————————————————————————————————————————————————————————————————

function verifySignature(req) {
	const url = new URL(req.url);
	const providedSecret = url.searchParams.get("secret");
	if (!MY_CUSTOM_WEBHOOK_SECRET || !providedSecret) {
		return false;
	}
	return providedSecret === MY_CUSTOM_WEBHOOK_SECRET;
}

//—————————————————————————————————————————————————————————————————————————————

export default {
	fetch: withSupabase({ auth: "none" }, async (req, ctx) => {
		const isValid = verifySignature(req);
		if (!isValid) {
			console.log("Unauthorized signature");
			return new Response("Unauthorized signature", { status: 401 });
		}

		try {
			console.log("fetching payload now");
			const payload = await req.json();
			await executeEventType(payload, ctx);

			console.log("Successful event type execution");
			return new Response("Successful", { status: 200 });
		} catch (error) {
			console.log("Execution failed", error);
			return new Response("Unsuccessful", { status: 400 });
		}
	}),
};

//—————————————————————————————————————————————————————————————————————————————