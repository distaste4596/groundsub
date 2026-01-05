import "../core/global.css";
import "./window.css";
import ProfilesWindow from "./profiles/ProfilesWindow.svelte";
import PreferencesWindow from "./preferences/PreferencesWindow.svelte";
import DetailsWindow from "./details/DetailsWindow.svelte";
import { appWindow, WebviewWindow, LogicalPosition } from "@tauri-apps/api/window";
import { initializeTheme } from "../core/theme";

async function loadWindowPosition() {
    try {
        const windowType = window.location.hash.replace("#", "") || "details";

        if (windowType === "preferences" || windowType === "profiles") {
            const detailsWindow = WebviewWindow.getByLabel('details');
            if (detailsWindow) {
                const detailsPos = await detailsWindow.outerPosition();
                const detailsSize = await detailsWindow.outerSize();
                const centerX = detailsPos.x + detailsSize.width / 2;
                const centerY = detailsPos.y + detailsSize.height / 2;
                const mySize = await appWindow.outerSize();
                const newX = centerX - mySize.width / 2;
                const newY = centerY - mySize.height / 2;
                await appWindow.setPosition(new LogicalPosition(newX, newY));
            }
        }
    } catch (e) {
        console.error('Failed to load window position:', e);
    }
}

window.addEventListener("DOMContentLoaded", async () => {
    await initializeTheme();
    await loadWindowPosition();
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
            await appWindow.hide();
        }
    });
}

if (minimizeButton) {
    minimizeButton.addEventListener("click", () => appWindow.minimize());
}

const targetElement = document.querySelector("#content")!;
if (!targetElement) {
    throw new Error("Could not find #content element");
}

const app = getWindowType();

function getWindowType() {
    let windowType = window.location.hash.split("#")[1];
    switch (windowType) {
        case "preferences":
            return new PreferencesWindow({
                target: targetElement
            });
        case "profiles":
            return new ProfilesWindow({
                target: targetElement
            });
        case "details":
            return new DetailsWindow({
                target: targetElement
            });
        default:
            appWindow.close();
            break;
    }
}

export default app;
