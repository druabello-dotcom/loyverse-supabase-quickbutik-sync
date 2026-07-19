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

//—————————————————————————————————————————————————————————————————————————————

export default {
	fetch: withSupabase({ auth: "none "}, async (req, ctx) => {
		const isValid = verifySignature(req);
		if (!isValid) {
			console.log("Unauthorized signature");
			return new Response("Unauthorized signature", { status: 401 });
		}

		try {
			const payload = await req.json();
			if (payload.receipt_type === "SALE") await processSale(ctx, payload);
			else await processRefund(ctx, payload);
				
			
		} catch (error) {
			console.error("API unsuccessful: ", error);
			return new Response("API unsuccessful: ", error);
		}

	}),
};

async function processSale(ctx, payload) {
	if (payload.cancelled_at) {
		await cancelSale(ctx, payload);
		return;
	}

	// insert the transaction
	const { error: transaction } = await ctx.supabaseAdmin
	.from("sale_transactions")
	.upsert({
		receipt_number: payload.receipt_number,
		store_id: payload.store_id,
		customer_id: payload.store_id,
		employee_id: payload.employee_id,

		transaction_date: payload.created_at,

		subtotal: payload.total_money + payload.total_discount - payload.total_tax,
		discount_amount: payload.total_discount,
		tax_amount: payload.total_tax,
		total: payload.total_money
	}, { onConflict: "store_id, receipt_number"});
	if (transaction) {
		console.error(`FAILED to upsert transaction '${payload.receipt_number}'`);
		throw new Error(`FAILED to upsert transaction '${payload.receipt_number}'`);
	}
}