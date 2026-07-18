export async function generateEAN13(ctx, item) {
	// supplier_number
	const { data: supplier } = await ctx.supabaseAdmin
	.from("suppliers")
	.select("supplier_id, supplier_number, items_registered")
	.eq("supplier_id", item.primary_supplier_id)
	.maybeSingle();
	if (!supplier) {
		console.log("Could not find supplier object");
		throw new Error("Could not find supplier object", { status: 404 });
	}

	const cleanSupplier = String(supplier.supplier_number).padStart(5, '0').substring(0, 5);
	const seq = supplier.items_registered + 1;

	// first 12 digits
	const digits = `${cleanSupplier}${String(seq).padStart(7, '0')}`;

	// loop through digits
	let sum = 0;
	for (let i = 0; i < 12; i++) {
		const digit = parseInt(digits[i], 10);
		sum += (i % 2 === 0) ? digit : digit * 3;
	}
	const checkDigit = (10 - (sum % 10)) % 10;

	// update supplier.items_registered
	const { error: supplierError } = await ctx.supabaseAdmin
	.from("suppliers")
	.update({ items_registered: seq})
	.eq("supplier_id", supplier.supplier_id);
	if (supplierError) {
		console.error(`Failed to update 'items registered'`);
		throw new Error("Failed to update 'items_registerd'", { status: 500 });
	}

	return `${digits}${checkDigit}`;
}