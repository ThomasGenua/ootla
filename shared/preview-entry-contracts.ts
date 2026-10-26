export interface PreviewEntry {
 kind:'isolated_preview'|'separate_preview'|'unavailable';
 destination:string|null;
 notice:string;
}
