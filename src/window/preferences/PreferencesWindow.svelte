<script lang="ts">
    import { appWindow } from "@tauri-apps/api/window";
    import LineButton from "../widgets/LineButton.svelte";
    import StyledCheckbox from "./StyledCheckbox.svelte";
    import type { default as ColorPicker } from "./ColorPicker.svelte";
    import ColorPickerComponent from "./ColorPicker.svelte";
    import type { Preferences } from "../../core/types";
    import * as ipc from "../../core/ipc";
    import { onMount, onDestroy } from "svelte";
    import { updateTheme, initializeTheme } from "../../core/theme";
    
    interface ColorChangeEvent extends CustomEvent {
        detail: string;
    }

    let preferences: Preferences;
    let error: string;
    let originalPreferences: Preferences | null = null;

    async function init() {
        const p = await ipc.getPreferences();
        originalPreferences = {...p};
        preferences = p;
        updateCssVariables();
    }

    function updateCssVariables() {
        if (preferences) {
            document.documentElement.style.setProperty('--primary-background', preferences.primaryBackground);
            document.documentElement.style.setProperty('--secondary-background', preferences.secondaryBackground);
            document.documentElement.style.setProperty('--primary-highlight', preferences.primaryHighlight);
        }
    }

    async function confirm() {
        try {
            await ipc.setPreferences(preferences);
            updateCssVariables();
            appWindow.close();
        } catch (e: unknown) {
            error = e instanceof Error ? e.message : String(e);
            appWindow.show();
        }
    }

    async function handleExit() {
        if (originalPreferences) {
            await updateTheme({
                primaryBackground: originalPreferences.primaryBackground,
                secondaryBackground: originalPreferences.secondaryBackground,
                primaryHighlight: originalPreferences.primaryHighlight,
                clearTextColor: originalPreferences.clearTextColor
            });
        }
        appWindow.close();
    }

    onMount(() => {
        updateCssVariables();
        
        const unloadHandler = () => {
            if (originalPreferences) {
                updateTheme({
                    primaryBackground: originalPreferences.primaryBackground,
                    secondaryBackground: originalPreferences.secondaryBackground,
                    primaryHighlight: originalPreferences.primaryHighlight,
                    clearTextColor: originalPreferences.clearTextColor
                });
            }
        };
        
        window.addEventListener('beforeunload', unloadHandler);
        
        return () => {
            window.removeEventListener('beforeunload', unloadHandler);
        };
    });

    async function handlePrimaryColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.primaryBackground = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor
        });
    }

    async function handleSecondaryColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.secondaryBackground = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor
        });
    }

    async function handleHighlightColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.primaryHighlight = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor
        });
    }

    async function handleClearTextColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.clearTextColor = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: color
        });
    }

    async function resetToDefaultColors() {
        preferences.primaryBackground = '#12171c';
        preferences.secondaryBackground = '#180f1c';
        preferences.primaryHighlight = '#74259c';
        preferences.clearTextColor = '#ffffff';
        
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor
        });
        
        const colorPickers = document.querySelectorAll('color-picker');
        colorPickers.forEach(picker => {
            if (picker.shadowRoot) {
                const input = picker.shadowRoot.querySelector('input[type="color"]');
                if (input) {
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        });
    }

    onMount(() => {
        updateCssVariables();
    });

    init();

    export { handleExit };
</script>

<main>
    <h1>Preferences</h1>
    {#if preferences}
        <div class="preferences">
            {#if error}
                <p class="error">{error}</p>
            {/if}
            <div class="preference">
                <StyledCheckbox bind:checked={preferences.enableOverlay}
                    >Enable overlay</StyledCheckbox
                >
            </div>
            <div class="preference-group">
                <div class="preference">
                    <StyledCheckbox
                        bind:checked={preferences.displayDailyClears}
                        disabled={!preferences.enableOverlay}
                        >Display clears count</StyledCheckbox
                    >
                </div>
                <div class="preference">
                    <StyledCheckbox
                        bind:checked={preferences.displayIcons}
                        disabled={!preferences.enableOverlay}
                        >Display icons</StyledCheckbox
                    >
                </div>
                <div class="preference">
                    <StyledCheckbox
                        bind:checked={preferences.displayClearNotifications}
                        disabled={!preferences.enableOverlay}
                        >Display activity clear notifications</StyledCheckbox
                    >
                </div>
                <div class="preference">
                    <StyledCheckbox
                        bind:checked={preferences.displayMilliseconds}
                        disabled={!preferences.enableOverlay}
                        >Display timer milliseconds</StyledCheckbox>
                </div>
            </div>
            <div class="preference-group">
                <h3>Appearance</h3>
                <div class="color-options">
                    <div class="color-picker-container">
                        <ColorPickerComponent 
                            label="Primary Color"
                            bind:value={preferences.primaryBackground}
                            on:change={handlePrimaryColorChange}
                        />
                    </div>
                    <div class="color-picker-container">
                        <ColorPickerComponent 
                            label="Secondary Color"
                            bind:value={preferences.secondaryBackground}
                            on:change={handleSecondaryColorChange}
                        />
                    </div>
                    <div class="color-picker-container">
                        <ColorPickerComponent 
                            label="Highlight Color"
                            bind:value={preferences.primaryHighlight}
                            on:change={handleHighlightColorChange}
                        />
                    </div>
                    <div class="color-picker-container">
                        <ColorPickerComponent 
                            label="Clear Count / Timer Color"
                            bind:value={preferences.clearTextColor}
                            on:change={handleClearTextColorChange}
                        />
                    </div>
                </div>
            </div>
            <div class="actions">
                <div style="display: flex; justify-content: space-between; width: 100%;">
                    <LineButton clickCallback={resetToDefaultColors}>Reset Colors</LineButton>
                    <LineButton clickCallback={confirm}>Save Changes</LineButton>
                </div>
            </div>
        </div>
    {/if}
</main>

<style>
    :global(.preferences-window) {
        font-size: 14px;
        line-height: 1.4;
    }

    h1 {
        margin: 10px 48px 12px 48px;
        font-size: 1.3em;
        font-weight: 500;
    }

    .preferences {
        margin: 12px 48px 16px 48px;
    }

    .preference-group {
        padding: 8px 12px;
        margin: 8px 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
    }

    h3 {
        margin: 0 0 10px 0;
        font-size: 1em;
        font-weight: 500;
        opacity: 0.9;
    }

    .preference {
        margin: 4px 0;
    }

    .color-options {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 2px 0;
    }
    
    .color-picker-container {
        width: 100%;
        padding: 2px 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }
    
    .color-picker-container:last-child {
        border-bottom: none;
    }

    .error {
        color: var(--error);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin: 6px 0 0 0;
    }

</style>
