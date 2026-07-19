// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";

const MY_CUSTOM_WEBHOOK_SECRET = Deno.env.get("MY_CUSTOM_WEBHOOK_SECRET");

function verifySignature(req) {
	const url = new URL(req.url);
	const providedSecret = url.searchParams.get("secret");
	if (MY_CUSTOM_WEBHOOK_SECRET !== providedSecret) {
		return false;
	} else return true;

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
			const payload = await req.json();
			console.log(`Receipt recieved: `, payload);
			
			for (const receipt of payload.receipts) {
				if (receipt.receipt_type === "SALE") await processSale(ctx, receipt);
			}

			console.log("Successful");
			return new Response("Successful");
		} catch (error) {
			console.error("API unsuccessful: ", error);
			return new Response("API unsuccessful: ", error);
		}

	}),
};

//—————————————————————————————————————————————————————————————————————————————

async function processSale(ctx, payload) {
	if (payload.cancelled_at) {
		await cancelSale(ctx, payload); // make this function
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

	//--------------------------------------------
	// iterate through transaction discounts
	const { data, error } = await ctx.supabaseAdmin
	.from("sale_transactions")
	.select("transaction_id")
	.eq("receipt_number", payload.receipt_number)
	.maybeSingle();
	if (error || !data) {
		console.error(`FAILED to get 'transaction_id': ${error.message}`);
		throw new Error(`FAILED to get 'transaction_id': ${error.message}`);
	}
	const transactionId = data.transaction_id;

	for (const discount of payload.total_discounts) {
		const { error: transactionDiscounts } = await ctx.supabaseAdmin
		.from("transaction_discounts")
		.upsert({
			transaction_id: transactionId,
			loyverse_discount_id: discount.id,
			type: discount.type,
			name: discount.name,
			percentage: discount.type === "VARIABLE_PERCENT" ? discount.percentage : null,
			amount: discount.money_amount
		}, { onConflict: "discount_id" });
		if (transactionDiscounts) {
			console.error(`FAILED to upsert transaction discounts object`);
			throw new Error(`FAILED to upsert transaction discounts object`);
		}
	}

	//--------------------------------------------	
	// iterate through transaction taxes
	for (const tax of payload.total_taxes) {
		const { error: transactionTaxes } = await ctx.supabaseAdmin
		.from("transaction_taxes")
		.upsert({
			transaction_id: transactionId,
			loyverse_tax_id: tax.id,
			type: tax.type,
			name: tax.name,
			rate: tax.rate,
			amount: tax.money_amount
		}, { onConflict: "tax_id"})
		if (transactionTaxes) {
			console.error(`FAILED to upsert tax: ${tax.name}`);
			throw new Error(`FAILED to upsert tax: ${tax.name}`);
		}
	}

	//--------------------------------------------	
	for (const item of payload.line_items) {

		// upsert line_item
		const { error: saleItem } = await ctx.supabaseAdmin
		.from("sale_items")
		.upsert({
			transaction_id: transactionId,

			loyverse_line_item_id: item.id,
			variant_id: item.variant_id,
			item_name: item.item_name,
			sku_barcode: item.sku,

			quantity: item.quantity,

			unit_price: item.price,
			gross_total: item.gross_total_money,
			discount_amount: item.total_discount,
			net_total: item.total_money
		} { onConflict: "salte_item_id"});
		if (saleItem) {
			console.error(`FAILED to upsert sale_item: ${item.item_name}`);
			throw new Error(`FAILED to upsert sale_item: ${item.item_name}`);
		}

		// upsert sale_item_discounts
		const { data, error } = await ctx.supabaseAdmin
		.from("sale_items")
		.select("sale_item_id")
		.eq("transaction_id", transactionId)
		.maybeSingle();

		if (error || !data) {
			console.log(`FAILED to get 'sale_item_id: ${error.message}`);
			throw new Error(`FAILED to get 'sale_item_id: ${error.message}`);
		}
		const saleItemId = data.sale_item_id;

		for (const discount of item.line_discounts) {
			const { error: saleItemDiscount } = await ctx.supabaseAdmin
			.from("sale_item_discounts")
			.upsert({
				sale_item_id: saleItemId,
				discount_id: discount.id,
				amount: discount.money_amount
			}, { onConflict: "sale_item_id, discount_id" });
			if (saleItemDiscount) {
				console.error("FAILED to upsert to 'sale_item_discounts");
				throw new Error("FAILED to upsert to 'sale_item_discounts");
			}
		}

		//upsert the taxes
		for (const tax of item.line_taxes) {
			const { error: saleItemTax } = await ctx.supabaseAdmin
			.from("sale_item_taxes")
			.upsert({
				sale_item_id: saleItemId,
				tax_id: tax.id,
				amount: tax.money_amount
			}, { onConflict: "sale_item_id, tax_id"});
			if (saleItemTax) {
				console.log(`FAILED upsertion to sale_item_taxes. Amount: ${tax.money_amount}`);
				throw new Error(`FAILED upsertion to sale_item_taxes. Amount: ${tax.money_amount}`);
			}
		}
	}
}