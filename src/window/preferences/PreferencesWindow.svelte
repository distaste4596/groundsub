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
    import SearchableSelect from "../details/SearchableSelect.svelte";
    
    interface ColorChangeEvent extends CustomEvent {
        detail: string;
    }

    let preferences: Preferences;
    let error: string;
    let originalPreferences: Preferences | null = null;
    let activeTab: 'overlay' | 'details' | 'appearance' = 'overlay';

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
                clearTextColor: originalPreferences.clearTextColor,
                incompleteColor: originalPreferences.incompleteColor,
                completedColor: originalPreferences.completedColor
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
                    clearTextColor: originalPreferences.clearTextColor,
                    incompleteColor: originalPreferences.incompleteColor,
                    completedColor: originalPreferences.completedColor
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

    async function handleIncompleteColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.incompleteColor = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor,
            incompleteColor: color,
            completedColor: preferences.completedColor
        });
    }

    async function handleCompletedColorChange(event: ColorChangeEvent) {
        const color = event.detail;
        preferences.completedColor = color;
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor,
            incompleteColor: preferences.incompleteColor,
            completedColor: color
        });
    }

    async function resetToDefaultColors() {
        preferences.primaryBackground = '#12171c';
        preferences.secondaryBackground = '#180f1c';
        preferences.primaryHighlight = '#74259c';
        preferences.clearTextColor = '#ffffff';
        preferences.incompleteColor = '#ff6b6b';
        preferences.completedColor = '#51cf66';
        
        await updateTheme({
            primaryBackground: preferences.primaryBackground,
            secondaryBackground: preferences.secondaryBackground,
            primaryHighlight: preferences.primaryHighlight,
            clearTextColor: preferences.clearTextColor,
            incompleteColor: preferences.incompleteColor,
            completedColor: preferences.completedColor
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
            
            <div class="tab-navigation">
                <button 
                    class="tab-button" 
                    class:active={activeTab === 'overlay'}
                    on:click={() => activeTab = 'overlay'}
                >
                    Overlay
                </button>
                <button 
                    class="tab-button" 
                    class:active={activeTab === 'details'}
                    on:click={() => activeTab = 'details'}
                >
                    Details
                </button>
                <button 
                    class="tab-button" 
                    class:active={activeTab === 'appearance'}
                    on:click={() => activeTab = 'appearance'}
                >
                    Appearance
                </button>
            </div>

            <div class="tab-content">
                {#if activeTab === 'overlay'}
                    <div class="tab-panel">
                        <div class="preference">
                            <StyledCheckbox bind:checked={preferences.enableOverlay}
                                >Enable overlay</StyledCheckbox
                            >
                        </div>
                        <div class="preference-group">
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.displayTimer}
                                    disabled={!preferences.enableOverlay}
                                    >Display timer</StyledCheckbox>
                            </div>
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.displayMilliseconds}
                                    disabled={!preferences.enableOverlay}
                                    >Display timer milliseconds</StyledCheckbox>
                            </div>
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.displayDailyClears}
                                    disabled={!preferences.enableOverlay}
                                    >Display clears count</StyledCheckbox
                                >
                            </div>
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.displayAverageClearTimeOverlay}
                                    disabled={!preferences.enableOverlay}
                                    >Display average clear time</StyledCheckbox
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
                                    bind:checked={preferences.displayNowPlaying}
                                    disabled={!preferences.enableOverlay}
                                    >Display now playing (Spotify, etc.)</StyledCheckbox
                                >
                            </div>
                        </div>
                        <div class="preference-group">
                            <div class="preference">
                                <div class="toggle-inline">
                                    <span class="toggle-label">Overlay position:</span>
                                    <SearchableSelect
                                        bind:value={preferences.overlayPosition}
                                        options={[
                                            { value: 'left', label: 'Left (Default)' },
                                            { value: 'right', label: 'Right' },
                                            { value: 'bottom-right', label: 'Bottom Right' },
                                            { value: 'custom', label: 'Custom' }
                                        ]}
                                        searchable={false}
                                        width="160px"
                                        placeholder="Select position"
                                    />
                                </div>
                            </div>
                            {#if preferences.overlayPosition === 'custom'}
                            <div class="offset-inputs">
                                <div class="offset-input-group">
                                    <label for="custom-x">X offset:</label>
                                    <input
                                        id="custom-x"
                                        type="number"
                                        bind:value={preferences.customOverlayX}
                                        class="number-input"
                                        on:focus={(e) => e.currentTarget.select()}
                                    />
                                </div>
                                <div class="offset-input-group">
                                    <label for="custom-y">Y offset:</label>
                                    <input
                                        id="custom-y"
                                        type="number"
                                        bind:value={preferences.customOverlayY}
                                        class="number-input"
                                        on:focus={(e) => e.currentTarget.select()}
                                    />
                                </div>
                            </div>
                            {/if}
                        </div>
                    </div>
                {:else if activeTab === 'details'}
                    <div class="tab-panel">
                        <div class="preference-group">
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.showTimestampInstead}
                                    >Show timestamp instead of time elapsed</StyledCheckbox>
                            </div>
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.useRealTime}
                                    title="When enabled, uses 24h / 7d / 30d instead of Last Daily Reset / Last Weekly Reset / Last 4 Weekly Resets."
                                    >Use real time instead of Bungie time</StyledCheckbox>
                            </div>
                            <div class="preference">
                                <StyledCheckbox
                                    bind:checked={preferences.displayAverageClearTimeDetails}
                                    >Display average clear time</StyledCheckbox>
                            </div>
                            <div class="preference sub-setting" class:disabled={!preferences.displayAverageClearTimeDetails}>
                                <StyledCheckbox
                                    bind:checked={preferences.displayDifferenceIndicator}
                                    disabled={!preferences.displayAverageClearTimeDetails}
                                    >Display difference from average time</StyledCheckbox>
                            </div>
                            <div class="preference">
                                <div class="toggle-inline">
                                    <span class="toggle-label">Raid link provider:</span>
                                    <SearchableSelect
                                        bind:value={preferences.raidLinkProvider}
                                        options={[
                                            { value: 'raid.report', label: 'raid.report' },
                                            { value: 'raidhub.io', label: 'raidhub.io' }
                                        ]}
                                        searchable={false}
                                        width="160px"
                                        placeholder="Select provider"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                {:else if activeTab === 'appearance'}
                    <div class="tab-panel">
                        <div class="preference-group">
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
                                <div class="color-picker-row">
                                    <div class="color-picker-container">
                                        <ColorPickerComponent 
                                            label="Completed"
                                            bind:value={preferences.completedColor}
                                            on:change={handleCompletedColorChange}
                                        />
                                    </div>
                                    <div class="color-picker-container">
                                        <ColorPickerComponent 
                                            label="Incomplete"
                                            bind:value={preferences.incompleteColor}
                                            on:change={handleIncompleteColorChange}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div class="reset-button-container">
                                <LineButton clickCallback={resetToDefaultColors}>Reset Colors</LineButton>
                            </div>
                        </div>
                    </div>
                {/if}
            </div>

            <div class="actions">
                <div style="display: flex; justify-content: flex-end; width: 100%;">
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
        display: flex;
        flex-direction: column;
        height: 450px;
    }

    .tab-navigation {
        display: flex;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 16px;
    }

    .tab-button {
        background: none;
        border: none;
        color: rgba(255, 255, 255, 0.6);
        padding: 12px 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
        border-bottom: 2px solid transparent;
    }

    .tab-button:hover {
        color: rgba(255, 255, 255, 0.8);
    }

    .tab-button.active {
        color: var(--primary-highlight);
        border-bottom-color: var(--primary-highlight);
    }

    .tab-content {
        flex: 1;
        display: flex;
        flex-direction: column;
    }

    .tab-panel {
        animation: fadeIn 0.2s ease-in;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }

    .preference-group {
        padding: 5px 12px;
        margin: 6px 0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        min-height: auto;
        height: auto;
    }

    .preference {
        margin: 4px 0;
        line-height: 1.4;
        white-space: normal;
    }

    .preference.sub-setting.disabled {
        opacity: 0.4;
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

    .color-picker-row {
        display: flex;
        gap: 12px;
        margin-top: 2px;
    }

    .color-picker-row .color-picker-container {
        flex: 1;
        border-bottom: none;
        min-width: 0;
    }

    .error {
        color: var(--error);
    }

    .actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
        margin-top: auto;
        padding-top: 20px;
    }

    .reset-button-container {
        display: flex;
        justify-content: flex-start;
        margin-top: 10px;
    }

    .toggle-inline {
        display: flex;
        align-items: center;
        gap: 5px;
    }

    .toggle-label {
        font-weight: 400;
        color: rgba(255, 255, 255, 0.9);
        font-size: 14px;
        flex-shrink: 0;
        width: 106px;
    }

    .offset-inputs {
        display: flex;
        gap: 12px;
        align-items: center;
    }
 
    .offset-input-group {
        display: flex;
        align-items: center;
        gap: 6px;
    }
 
    .offset-input-group label {
        font-weight: 400;
        color: rgba(255, 255, 255, 0.7);
        font-size: 13px;
    }

    .number-input {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        padding: 6px 10px;
        color: rgba(255, 255, 255, 0.9);
        font-size: 13px;
        width: 77px;
        height: 32px;
        box-sizing: border-box;
        transition: all 0.1s ease;
        font-family: inherit;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        -moz-appearance: textfield;
    }

    .number-input::-webkit-outer-spin-button,
    .number-input::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }

    .number-input:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .number-input:focus {
        outline: none;
        border-color: var(--primary-highlight);
    }

</style>
