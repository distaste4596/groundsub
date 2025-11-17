declare module "./ColorPicker.svelte" {
    import { SvelteComponent } from "svelte";
    
    export interface ColorPickerProps {
        label: string;
        value: string;
    }

    export default class ColorPicker extends SvelteComponent<ColorPickerProps> {}
}
