import "../core/global.css";
import "./window.css";
import ProfilesWindow from "./profiles/ProfilesWindow.svelte";
import PreferencesWindow from "./preferences/PreferencesWindow.svelte";
import DetailsWindow from "./details/DetailsWindow.svelte";
import { appWindow } from "@tauri-apps/api/window";
import { initializeTheme } from "../core/theme";

window.addEventListener("DOMContentLoaded", async () => {
    await initializeTheme();
    appWindow.show();
    appWindow.setFocus();
});

document.addEventListener("contextmenu", (e) => e.preventDefault());

const exitButton = document.querySelector<HTMLButtonElement>("#exit-button");
const minimizeButton = document.querySelector<HTMLButtonElement>("#minimize-button");

if (exitButton) {
    exitButton.addEventListener("click", async () => {
        if (window.location.hash === "#preferences" && app && 'handleExit' in app && typeof app.handleExit === 'function') {
            await (app as any).handleExit();
        } else {
            await appWindow.close();
        }
    });
}

if (minimizeButton) {
    minimizeButton.addEventListener("click", () => appWindow.minimize());
}

const target = document.querySelector("#content");
if (!target) {
    throw new Error("Could not find #content element");
}

const app = getWindowType();

function getWindowType() {
    let windowType = window.location.hash.split("#")[1];
    switch (windowType) {
        case "preferences":
            return new PreferencesWindow({
                target
            });
        case "profiles":
            return new ProfilesWindow({
                target
            });
        case "details":
            return new DetailsWindow({
                target
            });
        default:
            appWindow.close();
            break;
    }
}

export default app;
