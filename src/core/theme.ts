import { getPreferences } from "./ipc";
import { emit, listen } from "@tauri-apps/api/event";

export const THEME_UPDATE_EVENT = 'theme-update';

export async function initializeTheme() {
    try {
        const prefs = await getPreferences();
        updateCssVariables(prefs);

        await listen<ThemeVariables>(THEME_UPDATE_EVENT, (event) => {
            updateCssVariables(event.payload);
        });
    } catch (error) {
        console.error("Failed to initialize theme:", error);
        updateCssVariables({
            primaryBackground: "#12171c",
            secondaryBackground: "#180f1c",
            primaryHighlight: "#74259c",
            clearTextColor: "#d2d8ed",
            incompleteColor: "#ff6b6b",
            completedColor: "#51cf66"
        });
    }
}

export async function updateTheme(prefs: ThemeVariables) {
    updateCssVariables(prefs);
    await emit(THEME_UPDATE_EVENT, prefs);
}

function updateCssVariables(prefs: ThemeVariables) {
    const root = document.documentElement;
    root.style.setProperty('--primary-background', prefs.primaryBackground);
    root.style.setProperty('--secondary-background', prefs.secondaryBackground);
    root.style.setProperty('--primary-highlight', prefs.primaryHighlight);

    if (prefs.clearTextColor) {
        root.style.setProperty('--clear-text-color', prefs.clearTextColor);
    }

    if (prefs.incompleteColor) {
        root.style.setProperty('--difference-incomplete-color', prefs.incompleteColor);
    }

    if (prefs.completedColor) {
        root.style.setProperty('--difference-completed-color', prefs.completedColor);
    }
}

type ThemeVariables = {
    primaryBackground: string;
    secondaryBackground: string;
    primaryHighlight: string;
    clearTextColor?: string;
    incompleteColor?: string;
    completedColor?: string;
};
