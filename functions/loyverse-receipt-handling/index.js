// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MY_CUSTOM_WEBHOOK_SECRET = Deno.env.get("MY_CUSTOM_WEBHOOK_SECRET");

function verifySignature(req) {
	const url = new URL(req);
	const providedSecret = url.searchParams.get("secret");
	if (MY_CUSTOM_WEBHOOK_SECRET !== providedSecret) {
		return false;
	} else return true;

}
export default {
	fetch: withSupabase({ auth: "none "}, async (req, ctx) => {
		const isValid = verifySignature(req);
		if (!isValid) {
			console.log("Unauthorized signature");
			return new Response("Unauthorized signature", { status: 401 });
		}

		try {
			const payload = await req.json();
		} catch (error) {
			console.error("API unsuccessful: ", error);
			return new Response("API unsuccessful: ", error);
		}

	}),
};
