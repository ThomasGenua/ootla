export interface PreviewEntry {
 kind:'staff_sign_in'|'isolated_preview'|'separate_preview'|'unavailable';
 destination:string|null;
 notice:string;
}
