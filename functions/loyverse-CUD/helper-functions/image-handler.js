export async function imageUploadToSupabaseStorage(ctx, productId, imageUrl) {
    try {
        // 1. Fetch the image from the Loyverse URL to convert it into a binary Blob
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error("Failed to download image from Loyverse");
        const fileBlob = await response.blob();

        // 2. Dynamically determine the extension from the content-type header (e.g., "image/png" -> "png")
        const mimeType = fileBlob.type || "image/jpeg"; 
        const extension = mimeType.split("/")[1] || "jpg";
        const fileName = `main.${extension}`;

        // 3. Upload the downloaded file to your Supabase Storage bucket
        const { data: storageData, error: storageError } = await ctx.supabaseAdmin
            .storage
            .from("product-images")
            .upload(`${productId}/${fileName}`, fileBlob, {
                contentType: mimeType,
                upsert: true
            });
            
        if (storageError) throw storageError;

        // 4. Get the permanent public link
        const { data: { publicUrl } } = ctx.supabaseAdmin
            .storage
            .from("product-images")
            .getPublicUrl(storageData.path);

        // 5. Track globally
        const { data: imageData, error: imageError } = await ctx.supabaseAdmin
            .from("product_images_global")
            .insert({ public_url: publicUrl, alt_text: "Product image" })
            .select("image_id")
            .single();
            
        if (imageError) throw imageError;

        // 6. Link to parent product without duplicate rows
        const { error: junctionError } = await ctx.supabaseAdmin
            .from("product_images_designated")
            .upsert({
                product_id: productId,
                image_id: imageData.image_id,
                is_primary: true,
                display_order: 1 
            }, { onConflict: "product_id, image_id" });
            
        if (junctionError) throw junctionError;
        
        return publicUrl;
    } catch (err) {
        console.error(`Image processing failed for product ${productId}:`, err.message);
		throw new Error(`Image processing failed for product ${productId}`, { status: 500 });
        // Throw or return null depending on if you want the whole webhook to fail
    }
}