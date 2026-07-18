import { imageUploadToSupabaseStorage } from "./image-handler.js";
import { generateEAN13  } from "./generate-ean13.js";

//—————————————————————————————————————————————————————————————————————————————

function defineAttributesObject(item, variant) {
    // will look something like this variantObject = {"size":"M","color":"blue","material":"cotton"}
    const attributes = {};
    updateAttributesObject(item.option1_name, variant.option1_value, attributes);
    updateAttributesObject(item.option2_name, variant.option2_value, attributes);
    updateAttributesObject(item.option3_name, variant.option3_value, attributes);
    return attributes;
}

function updateAttributesObject(optionX_name, optionX_value, attributesObject) {
    if (optionX_value && optionX_name)
        attributesObject[optionX_name.toUpperCase()] = optionX_value.toUpperCase();
}

//—————————————————————————————————————————————————————————————————————————————
const LOYVERSE_API_TOKEN = Deno.env.get("LOYVERSE_API_TOKEN");
export async function executeEventType(payload, ctx) {
/* 	console.log({
		type: payload.type,
		created_at: payload.created_at,
		items: payload.items.map(i => ({
			id: i.id,
			name: i.item_name,
			updated_at: i.updated_at,
			deleted_at: i.deleted_at
		}))
	}); */

	if (!payload.items) {
		console.error("ERROR missing 'items' array in payload");
		throw new Error("ERROR missing 'items' array in payload");
	}

	// loop through all items
	for (const item of payload.items) {
		await processParentItem(ctx, item, payload);
	}
}

//—————————————————————————————————————————————————————————————————————————————

async function processParentItem(ctx, item, payload) {
	console.log(`Webhook received for item: ${item.item_name} | updated_at: ${item.updated_at}`);
	console.log(item);

	//--------------------------------------------

	// delete item
	if (item.deleted_at) {
		const { error: parentError } = await ctx.supabaseAdmin
		.from("products").delete().eq("product_id", item.id);
		if (parentError) {
			console.error(`Deletion failed: ${parentError.message}`)
			throw new Error(`Deletion failed: ${parentError.message}`, { status: 500 });
		}

		// supplier information
		const supplierResponse = await fetch(`https://api.loyverse.com/v1.0/suppliers/${item.primary_supplier_id}`,{
			method: "GET",
			headers: {
				"Authorization": `Bearer ${LOYVERSE_API_TOKEN}`,
				"Content-Type": "application/json"
			}
		});
		if (!supplierResponse.ok) {
			const errorText = await supplierResponse.text();
			console.error(`Failed to fetch SUPPLIER DATA: ${errorText}`);
			throw new Error(`Failed to fetch SUPPLIER DATA: ${errorText}`, { status: 500 });
		}
		const supplier = await supplierResponse.json();

		const { error: insertToTable } = await ctx.supabaseAdmin
		.from("deleted_products")
		.upsert({
			product_id: item.id,
			item_name: item.item_name,
			supplier_id: item.primary_supplier_id,
			supplier_name: supplier.name,
			deleted_at: item.deleted_at
		}, { onConflict: "product_id"});
		if (insertToTable) {
			console.error(`FAILED to insert ${item.item_name} to 'deleted_products' table: ${insertToTable.message}`);
			throw new Error(`FAILED to insert ${item.item_name} to 'deleted_products' table: ${insertToTable.message}`);
		}

		console.log(`Item deleted: ${item.item_name}`);
		return;
	}
	// check if this item is already deleted
	const { data: deleted } = await ctx.supabaseAdmin
	.from("deleted_products")
	.select()
	.eq("product_id", item.id)
	.maybeSingle();
	if (deleted) {
		console.log(`Ignoring deleted item ${item.item_name}`);
		return;
	};

	//--------------------------------------------

	// check if iteration is echo loop
	const { data: existingProduct } = await ctx.supabaseAdmin
	.from("products")
	.select("date_updated")
	.eq("product_id", item.id)
	.maybeSingle();
	if (existingProduct?.date_updated) {
		const dbTime = new Date (existingProduct.date_updated).getTime();
		const webhookTime = new Date (item.updated_at).getTime();
		const ageMs = Date.now() - webhookTime;
		if (ageMs > 60 * 60 * 1000) {
			console.log(`Ignoring old webhook (${Math.round(ageMs/60000)} min) for: ${item.item_name}`);
			return;
		}
		if (Math.abs(dbTime - webhookTime) < 1000) {
			console.log(`🤖 Echo Loop Detected: Timestamps match for '${item.item_name}'. Skipping further processing.`);
			return; 
		}
	}
	console.log({
		item: item.item_name,
		webhookUpdated: item.updated_at,
		dbUpdated: existingProduct?.date_updated,
		diffMs: existingProduct
			? Math.abs(
				new Date(existingProduct.date_updated).getTime() -
				new Date(item.updated_at).getTime()
			)
			: null
	});

	//-------------------------------------------

	// upsert supplier
	if (item.primary_supplier_id) {
		const supplierResponse = await fetch(`https://api.loyverse.com/v1.0/suppliers/${item.primary_supplier_id}`,{
			method: "GET",
			headers: {
				"Authorization": `Bearer ${LOYVERSE_API_TOKEN}`,
				"Content-Type": "application/json"
			}
		});
		if (!supplierResponse.ok) {
			const errorText = await supplierResponse.text();
			console.error(`Failed to fetch SUPPLIER DATA: ${errorText}`);
			throw new Error(`Failed to fetch SUPPLIER DATA: ${errorText}`, { status: 500 });
		}
		const supplier = await supplierResponse.json();
		const { error: supplierError } = await ctx.supabaseAdmin
		.from("suppliers")
		.upsert({
			supplier_id: supplier.id,
			name: supplier.name,
			contact: supplier.contact,
			email: supplier.email,
			phone_number: supplier.phone_number,
			website: supplier.website,
			address_1: supplier.address_1,
			address_2: supplier.address_2,
			city: supplier.city,
			country_code: supplier.country_code,
			state_or_province: supplier.state_or_province,

			date_registered: supplier.created_at,
			date_updated: supplier.updated_at
		}, { onConflict: "supplier_id"});
		if (supplierError) {
			console.error(`ERROR upserting supplier ${supplier.name}: ${supplierError.message}`);
			throw new Error(`ERROR upserting supplier ${supplier.name}: ${supplierError.message}`, { status: 500 });
		}
	}

	//--------------------------------------------

	// upsert category
	await upsertCategory(ctx, item);
	
	//--------------------------------------------

	// upsert item
	const { error: parentError } = await ctx.supabaseAdmin
	.from("products")
	.upsert({
		product_id: item.id,
		supplier_id: item.primary_supplier_id,
		displayed_name: item.item_name,
		description: item.description,

		date_registered: item.created_at,
		date_updated: item.updated_at
	});
	if (parentError) {
		console.error(`FAILED to upsert parent product '${idetem.item_name}'`);
		throw new Error(`FAILED to upsert parent product '${item.item_name}'`);
	}

	if (item.image_url)
		await imageUploadToSupabaseStorage(ctx, item.id, item.image_url);

	//--------------------------------------------

	// process variants
	const variantsArray = []
	for (const variant of item.variants) {
		await processVariants(ctx, variant, item, variantsArray);
	}

	const taxIDs = Array.isArray(item.tax_ids) ? [...item.tax_ids] : [];
	const modifiers = Array.isArray(item.modifier_ids) ? [...item.modifier_ids] : [];
	const loyversePayload = {
		id: item.id,
		item_name: item.item_name,
		description: item.description,
		track_stock: true,
		category_id: item.category_id,
		primary_supplier_id: item.primary_supplier_id,
		tax_ids: taxIDs,
		image_url: item.image_url,
		variants: variantsArray,

		option1_name: typeof item.option1_name === "string" ? item.option1_name.toUpperCase() : null,
		option2_name: typeof item.option2_name === "string" ? item.option2_name.toUpperCase() : null,
		option3_name: typeof item.option3_name === "string" ? item.option3_name.toUpperCase() : null,
	}

	//--------------------------------------------

	// pass back to loyverse
	console.log(`[DEBUG] Sending to Loyverse for item '${item.item_name}':`);
	console.dir(loyversePayload, { depth: 3 });   // pretty print the full payload

	const loyverseResponse = await fetch("https://api.loyverse.com/v1.0/items", {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${LOYVERSE_API_TOKEN}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(loyversePayload)
	});
	console.log("[DEBUG] is has now been sent");
	if (!loyverseResponse.ok) {
		const errorText = await loyverseResponse.text();
		console.error(`POST request to update item '${item.item_name}' failed: ${errorText}`);
		throw new Error(`POST request to update item '${item.item_name}' failed: ${errorText}`);
	}

	const response = await fetch(`https://api.loyverse.com/v1.0/items/${item.id}`, {
		method: "GET",
		headers: {
			"Authorization": `Bearer ${LOYVERSE_API_TOKEN}`,
			"Content-Type": "application/json"
		}
		});
		if (!response.ok) {
			console.error(await response.text());
		} else {
			const updatedItem = await response.json();
			console.dir(updatedItem, { depth: null });
		}
}

//—————————————————————————————————————————————————————————————————————————————

async function processVariants(ctx, variant, item, variantsArray) {
	if (variant.deleted_at) {
		const { error: variantError } = await ctx.supabaseAdmin
		.from("product_variants")
		.delete()
		.eq("variant_id", variant.variant_id);
		if (variantError) {
			console.error(`ERROR variant deletion failed (at start of variant loop): ${variantError.message}`)
			throw new Error(`ERROR variant deletion failed: ${variantError.message}`);
		}
		return;
	}

	//--------------------------------------------

	let barcode = variant.barcode;
	if (!barcode || barcode === "") barcode = await generateEAN13(ctx, item);

	const attributes = defineAttributesObject(item, variant);
	const { error: variantError } = await ctx.supabaseAdmin
	.from("product_variants")
	.upsert({
		variant_id: variant.variant_id,
		parent_id: item.id,
		sku_barcode: barcode,
		price: variant.default_price,
		cost: variant.cost,
		attributes: attributes,
		date_updated: variant.updated_at
	});
	if (variantError) {
		console.error(`ERROR upserting variant ${JSON.stringify(attributes)}: ${variantError.message}`);
		throw new Error(`ERROR upserting variant ${variant.variant_id}: ${variantError.message}`);
	}

	const currentVariantObject = {
		variant_id: variant.variant_id,
		sku: barcode,
		barcode: barcode,
		cost: variant.cost,
		default_pricing_type: "FIXED",
		default_price: variant.default_price,
		
		option1_value: variant.option1_value,
		option2_value: variant.option2_value,
		option3_value: variant.option3_value,

		stores: variant.stores.map(store => ({
			store_id: store.store_id,
			pricing_type: store.pricing_type,
			price: store.price,
			available_for_sale: store.available_for_sale,
			optimal_stock: store.optimal_stock,
			low_stock: 3
		}))
	}
	variantsArray.push(currentVariantObject);
}

async function upsertCategory(ctx, item) {
	const categoryResponse = await fetch(`https://api.loyverse.com/v1.0/categories/${item.category_id}`,{
		method: "GET",
		headers: {
			"Authorization": `Bearer ${LOYVERSE_API_TOKEN}`,
			"Content-Type": "application/json"
		}
	});
	if (!categoryResponse.ok) {
		const errorText = await categoryResponse.text()
		console.error(`FAILED to fetch category: ${errorText}`);
		throw new Error(`FAILED to fetch category: ${errorText}`);
	}

	const category = await categoryResponse.json();
	const { error: categoryError } = await ctx.supabaseAdmin
	.from("categories")
	.upsert({
		category_id: category.id,
		category_name: capitalizeWords(category.name)
	}, { onConflict: "category_id"});
	if (categoryError) {
		console.error(`FAILED to upsert category: '${category.name}'`);
		throw new Error(`FAILED to upsert category: '${category.name}'`);
	}

	const { error: junctionError } = await ctx.supabaseAdmin
	.from("product_categories")
	.upsert({
		product_id: item.id,
		category_id: category.id,
		is_primary_category: true,
	}, { onConflict: "product_id, category_id"});
	if (junctionError) {
		console.error(`FAILED to upsert to junction: ${category.name}, ${item.item_name}`);
		throw new Error(`FAILED to upsert to junction: ${category.name}, ${item.item_name}`);
	}
}

function capitalizeWords(str) {
	return str
		.toLowerCase()
		.replace(/\b\w/g, char => char.toUpperCase());
}