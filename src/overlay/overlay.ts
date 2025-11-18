import "../core/global.css"
import "./overlay.css"
import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
import { createPopup as _createPopup, type Popup } from "./popups";
import type { TauriEvent, Preferences, CurrentActivity, PlayerDataStatus } from "../core/types";
import { emit, listen } from "@tauri-apps/api/event";
import { countClears, determineActivityType, formatMillis, formatTime } from "../core/util";
import { getPlayerdata, getPreferences } from "../core/ipc";
import { THEME_UPDATE_EVENT } from "../core/theme";

const widgetElem = document.querySelector<HTMLElement>("#widget")!;
const loaderElem = document.querySelector<HTMLElement>("#widget-loader")!;
const errorElem = document.querySelector<HTMLElement>("#widget-error")!;
const widgetContentElem = document.querySelector<HTMLElement>("#widget-content")!;
const timerElem = document.querySelector<HTMLElement>("#timer")!;
const timeElem = document.querySelector<HTMLElement>("#time")!;
const msElem = document.querySelector<HTMLElement>("#ms")!;
const counterElem = document.querySelector<HTMLElement>("#counter")!;
const dailyElem = document.querySelector<HTMLElement>("#daily")!;
const timespanTextElem = document.querySelector<HTMLElement>("#timespan-text")!;

let currentActivity: CurrentActivity;
let lastRaidId: string | undefined;
let doneInitialRefresh = false;

let shown = false;
let prefs: Preferences;
let timerInterval: number | undefined;
let currentTimespan: '1' | '7' | '30' = '1';
let currentActivityType: 'all' | 'raids' | 'dungeons' | 'other' = 'all';

function updateTimespanText() {
    if (!timespanTextElem) return;
    
    switch (currentTimespan) {
        case '1':
            timespanTextElem.textContent = ' today';
            break;
        case '7':
            timespanTextElem.textContent = ' this week';
            break;
        case '30':
            timespanTextElem.textContent = ' this month';
            break;
    }
}

async function init() {
    appWindow.listen("show", () => {
        if (shown) {
            return;
        }

        appWindow.show();
        shown = true;

        checkTimerInterval();
    });

    appWindow.listen("hide", () => {
        if (!shown) {
            return;
        }

        appWindow.hide();
        shown = false;

        checkTimerInterval();
    });

    const unlisten = await listen<{ timespan: '1' | '7' | '30', activityType: 'all' | 'raids' | 'dungeons' | 'other' }>('filter-changed', async (event) => {
        let needsRefresh = false;
        
        if (event.payload.timespan !== currentTimespan) {
            currentTimespan = event.payload.timespan;
            updateTimespanText();
            needsRefresh = true;
        }
        
        if (event.payload.activityType !== currentActivityType) {
            currentActivityType = event.payload.activityType;
            needsRefresh = true;
        }
        
        if (needsRefresh) {
            const playerData = await getPlayerdata();
            if (playerData) {
                refresh(playerData);
            }
        }
    });

    const prefs = await getPreferences();
    applyPreferences(prefs);
    
    document.documentElement.style.setProperty('--primary-background', prefs.primaryBackground);
    document.documentElement.style.setProperty('--secondary-background', prefs.secondaryBackground);
    document.documentElement.style.setProperty('--primary-highlight', prefs.primaryHighlight);
    document.documentElement.style.setProperty('--clear-text-color', prefs.clearTextColor || '#ffffff');
    
    updateTimespanText();
    const initialPlayerData = await getPlayerdata();
    if (initialPlayerData) {
        refresh(initialPlayerData);
    }

    listen<{ primaryBackground: string; secondaryBackground: string; primaryHighlight: string; clearTextColor?: string }>(THEME_UPDATE_EVENT, (event) => {
        const { primaryBackground, secondaryBackground, primaryHighlight, clearTextColor } = event.payload;
        document.documentElement.style.setProperty('--primary-background', primaryBackground);
        document.documentElement.style.setProperty('--secondary-background', secondaryBackground);
        document.documentElement.style.setProperty('--primary-highlight', primaryHighlight);
        if (clearTextColor) {
            document.documentElement.style.setProperty('--clear-text-color', clearTextColor);
        }
    });

    appWindow.listen("preferences_update", (p: TauriEvent<Preferences>) => applyPreferences(p.payload));
    appWindow.listen("playerdata_update", (e: TauriEvent<PlayerDataStatus>) => refresh(e.payload));
}

function createPopup(popup: Popup) {
    _createPopup(popup, shown);
}

function checkTimerInterval() {
    if (!prefs || !shown || !determineActivityType(currentActivity?.activityInfo?.activityModes)) {
        if (timerInterval) {
            clearTimeout(timerInterval);
        }
        timerInterval = undefined;
        timerElem.classList.add("hidden");
        return;
    }

    timerElem.classList.remove("hidden");

    if (!timerInterval) {
        timerInterval = setInterval(() => requestAnimationFrame(timerTick), 1000 / (prefs.displayMilliseconds ? 30 : 2));
    }
}

function filterActivities(activities: any[], timespan: string, activityType: string) {
    if (!activities) return [];
    
    let filtered = [...activities];
    const now = new Date();
    const activityDate = (period: string) => new Date(period);
    
    if (timespan === '1') {
        const today = new Date();
        today.setUTCHours(17, 0, 0, 0);
        if (today > now) {
            today.setUTCDate(today.getUTCDate() - 1);
        }
        filtered = filtered.filter(activity => activityDate(activity.period) >= today);
    } else if (timespan === '7') {
        const today = new Date(now);
        const day = today.getUTCDay();
        const daysSinceTuesday = (day + 5) % 7;
        const lastTuesday = new Date(today);
        lastTuesday.setUTCDate(today.getUTCDate() - daysSinceTuesday);
        lastTuesday.setUTCHours(17, 0, 0, 0);
        filtered = filtered.filter(activity => activityDate(activity.period) >= lastTuesday);
    }
    
    if (activityType !== 'all') {
        filtered = filtered.filter(activity => {
            const type = determineActivityType(activity.modes);
            if (!type) return false;
            if (activityType === 'raids') return type === 'Raid';
            if (activityType === 'dungeons') return type === 'Dungeon';
            if (activityType === 'other') return !['Raid', 'Dungeon'].includes(type);
            return true;
        });
    }
    
    return filtered;
}

function refresh(playerDataStatus: PlayerDataStatus) {
    let playerData = playerDataStatus?.lastUpdate;

    if (!playerData) {
        widgetContentElem.classList.add("hidden");

        currentActivity = null;
        doneInitialRefresh = false;

        if (playerDataStatus?.error) {
            loaderElem.classList.add("hidden");
            errorElem.classList.remove("hidden");
            createPopup({ title: "Failed to fetch initial stats", subtext: playerDataStatus.error });
        } else {
            errorElem.classList.add("hidden");
            loaderElem.classList.remove("hidden");
        }

        return;
    }

    loaderElem.classList.add("hidden");
    errorElem.classList.add("hidden");
    widgetContentElem.classList.remove("hidden");

    currentActivity = playerData.currentActivity;

    checkTimerInterval();

    const filteredActivities = filterActivities(playerData.activityHistory, currentTimespan, currentActivityType);
    dailyElem.innerText = String(countClears(filteredActivities));

    let latestRaid = filteredActivities[0];

    if (doneInitialRefresh && latestRaid?.completed && lastRaidId != latestRaid.instanceId && prefs.displayClearNotifications) {
        const type = determineActivityType(latestRaid.modes);

        if (type) {
            const typeFormatted = type.charAt(0).toUpperCase() + type.slice(1);
            createPopup({ title: `${typeFormatted} clear result`, subtext: `API Time: <strong>${latestRaid.activityDuration}</strong>` });
        }
    }

    lastRaidId = latestRaid?.instanceId;

    if (!doneInitialRefresh) {
        createPopup({ title: `${playerData.profileInfo.displayName}#${playerData.profileInfo.displayTag}`, subtext: "groundsub is active." });
    }

    doneInitialRefresh = true;
}

function applyPreferences(p: Preferences) {
    prefs = p;

    if (counterElem) {
        if (p.displayDailyClears) {
            counterElem.classList.remove("hidden");
        } else {
            counterElem.classList.add("hidden");
        }
    }
    
    if (msElem) {
        if (p.displayMilliseconds) {
            msElem.classList.remove("hidden");
        } else {
            msElem.classList.add("hidden");
        }
    }

    if (timerInterval) {
        clearTimeout(timerInterval);
    }
    timerInterval = undefined;

    checkTimerInterval();
}

function timerTick() {
    let millis = Number(new Date()) - Number(new Date(currentActivity.startDate));
    timeElem.innerHTML = formatTime(millis);
    msElem.innerHTML = formatMillis(millis);
}

init();
