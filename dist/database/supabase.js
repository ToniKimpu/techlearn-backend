const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
export async function uploadToStorage(bucket, path, buffer, contentType) {
    const url = `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`;
    const response = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": contentType,
        },
        body: new Uint8Array(buffer),
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to upload file");
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
}
//# sourceMappingURL=supabase.js.map