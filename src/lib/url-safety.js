// preview.source comes straight from a registry-controlled image label — never
// render it as a clickable href without checking the scheme first. React only
// escapes text content, not href attribute values (e.g. a javascript: URI
// would execute if clicked).
export function isSafeUrl(url) {
    try {
        return ["http:", "https:"].includes(new URL(url).protocol);
    } catch {
        return false;
    }
}
