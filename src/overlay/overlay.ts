import "../core/global.css"
import "./overlay.css"
import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
import { createPopup as _createPopup, type Popup } from "./popups";
import type { TauriEvent, Preferences, CurrentActivity, PlayerDataStatus } from "../core/types";
import { emit, listen } from "@tauri-apps/api/event";
import { countClears, determineActivityType, calculateAverageClearTime, formatTimeWithUnit } from "../core/util";
import { getPlayerdata, getPreferences, getCurrentMedia } from "../core/ipc";
import { THEME_UPDATE_EVENT } from "../core/theme";
import { type TimerState, type MediaInfo } from "../core/types";
import { GROUPED_RAIDS, GROUPED_DUNGEONS, KNOWN_RAIDS, KNOWN_DUNGEONS, EXCLUDED_ACTIVITIES } from "../core/consts";

function formatAverageTime(seconds: number): string {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `<span class="time-number">${hours}</span><span class="time-unit">h</span> <span class="time-number">${minutes}</span><span class="time-unit">m</span>`;
    } else if (minutes > 0) {
        return `<span class="time-number">${minutes}</span><span class="time-unit">m</span> <span class="time-number">${secs}</span><span class="time-unit">s</span>`;
    } else {
        return `<span class="time-number">${secs}</span><span class="time-unit">s</span>`;
    }
}

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
const averageTimeElem = document.querySelector<HTMLElement>("#average-time")!;
const averageTimeTextElem = document.querySelector<HTMLElement>("#average-time-text")!;
const nowPlayingElem = document.querySelector<HTMLElement>("#now-playing")!;
const nowPlayingSongElem = document.querySelector<HTMLElement>("#now-playing-song")!;
const nowPlayingTitleElem = document.querySelector<HTMLElement>("#now-playing-title")!;
const nowPlayingArtistElem = document.querySelector<HTMLElement>("#now-playing-artist")!;
const nowPlayingIconElem = document.querySelector<SVGElement>("#now-playing > svg")!;

let currentActivity: CurrentActivity | null;
let lastRaidId: string | undefined;
let lastClearCount: number = 0;
let doneInitialRefresh = false;
let timerMode: 'default' | 'persistent' = 'default';
let timerIsActive: boolean = false;
let timerWasActive: boolean = false;

let shown = false;
let prefs: Preferences;
let currentTimespan: '1' | '7' | '30' | 'custom' = '1';
let currentActivityType: 'all' | 'raids' | 'dungeons' | 'strikes' | 'lost-sectors' | 'story' | 'other' | string = 'all';
let previousUseRealTime: boolean;
let lastErrorPopup: string | null = null;
let currentCustomStartDate: string = '';

let cachedPlayerData: PlayerDataStatus | null = null;
let lastPlayerDataCheck: number = 0;
let clearCountCheckDebounce: number | null = null;
const DEBOUNCE_DELAY = 1000;
const PLAYER_DATA_CACHE_DURATION = 2000;

let cachedFilteredActivities: any[] = [];
let lastFilterCacheKey: string = '';
let lastFilterCacheTime: number = 0;
const FILTER_CACHE_DURATION = 5000;

let currentMediaInfo: MediaInfo | null = null;

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
        case 'custom':
            if (currentCustomStartDate) {
                const now = new Date();
                const startDate = new Date(currentCustomStartDate);
                const daysDiff = Math.floor((now.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
                const dayText = daysDiff === 1 ? 'day' : 'days';
                timespanTextElem.textContent = ` in ${daysDiff} ${dayText}`;
            } else {
                timespanTextElem.textContent = ' (custom)';
            }
            break;
    }
}

async function init() {
    listen<TimerState>('timer-state-update', (event) => {
        if (timeElem) timeElem.innerHTML = event.payload.timeText;
        if (msElem) msElem.innerHTML = event.payload.msText;
        
        timerMode = event.payload.mode;
        timerIsActive = event.payload.isActive;
        if (event.payload.isActive) timerWasActive = true;
        
        checkTimerVisibility();
        
        checkClearCountUpdate();
    });

    appWindow.listen("show", () => {
        if (shown) {
            return;
        }

        appWindow.show();
        shown = true;

        checkTimerVisibility();
    });

    appWindow.listen("hide", () => {
        if (!shown) {
            return;
        }

        appWindow.hide();
        shown = false;

        checkTimerVisibility();
    });

    const unlisten = await listen<{ timespan: '1' | '7' | '30' | 'custom', activityType: string, customStartDate?: string }>('filter-changed', async (event) => {
        let needsRefresh = false;
        
        if (event.payload.timespan !== currentTimespan) {
            currentTimespan = event.payload.timespan;
            updateTimespanText();
            needsRefresh = true;
        }
        
        if (event.payload.customStartDate !== currentCustomStartDate) {
            currentCustomStartDate = event.payload.customStartDate || '';
            if (currentTimespan === 'custom') {
                updateTimespanText();
                needsRefresh = true;
            }
        }
        
        if (event.payload.activityType !== currentActivityType) {
            currentActivityType = event.payload.activityType;
            needsRefresh = true;
        }
        
        clearFilterCache();
        
        if (needsRefresh) {
            const playerData = await getPlayerdata();
            if (playerData) {
                refresh(playerData);
            }
        }
        
        checkClearCountUpdate();
    });

    const prefs = await getPreferences();
    applyPreferences(prefs);
    
    document.documentElement.style.setProperty('--primary-background', prefs.primaryBackground);
    document.documentElement.style.setProperty('--secondary-background', prefs.secondaryBackground);
    document.documentElement.style.setProperty('--primary-highlight', prefs.primaryHighlight);
    document.documentElement.style.setProperty('--clear-text-color', prefs.clearTextColor || '#ffffff');
    document.documentElement.style.setProperty('--text-color', '#ffffff');
    
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
        document.documentElement.style.setProperty('--text-color', '#ffffff');
    });

    listen<MediaInfo>('media-update', (event) => {
        updateNowPlaying(event.payload);
    });

    getCurrentMedia().then(mediaInfo => {
        updateNowPlaying(mediaInfo);
    }).catch(() => {});

    appWindow.listen("preferences_update", (p: TauriEvent<Preferences>) => applyPreferences(p.payload));
    appWindow.listen("playerdata_update", (e: TauriEvent<PlayerDataStatus>) => refresh(e.payload));
}

function checkClearCountUpdate() {
    if (!prefs || !currentActivity) return;
    
    if (clearCountCheckDebounce) {
        clearTimeout(clearCountCheckDebounce);
    }
    
    clearCountCheckDebounce = window.setTimeout(() => {
        performClearCountCheck();
        clearCountCheckDebounce = null;
    }, DEBOUNCE_DELAY);
}

function performClearCountCheck() {
    const now = Date.now();
    
    if (cachedPlayerData && (now - lastPlayerDataCheck) < PLAYER_DATA_CACHE_DURATION) {
        updateClearCountFromData(cachedPlayerData);
        return;
    }
    
    getPlayerdata().then(playerDataStatus => {
        if (playerDataStatus) {
            cachedPlayerData = playerDataStatus;
            lastPlayerDataCheck = now;
            updateClearCountFromData(playerDataStatus);
        }
    });
}

function updateClearCountFromData(playerDataStatus: PlayerDataStatus) {
    if (!playerDataStatus?.lastUpdate) return;
    
    const filteredActivities = filterActivities(playerDataStatus.lastUpdate.activityHistory, currentTimespan, currentActivityType);
    const currentClearCount = countClears(filteredActivities);
    
    if (currentClearCount !== lastClearCount) {
        dailyElem.innerText = String(currentClearCount);
        lastClearCount = currentClearCount;
    }

    if (prefs.displayAverageClearTimeOverlay) {
        const averageTime = calculateAverageClearTime(filteredActivities);
        averageTimeTextElem.innerHTML = formatAverageTime(averageTime);
    }
}

function clearFilterCache() {
    cachedFilteredActivities = [];
    lastFilterCacheKey = '';
    lastFilterCacheTime = 0;
}


function createPopup(popup: Popup) {
    if (popup.title === "Error" && popup.subtext === lastErrorPopup) {
        return;
    }
    
    if (popup.title === "Error") {
        lastErrorPopup = popup.subtext;
    } else {
        lastErrorPopup = null;
    }
    
    _createPopup(popup, shown);
}

function checkTimerVisibility() {
    const activityType = determineActivityType(currentActivity?.activityInfo?.activityModes || []);
    const shouldShow = prefs && prefs.displayTimer && shown && 
                      ((timerMode === 'persistent' && timerWasActive && timerIsActive) || 
                       (timerMode !== 'persistent' && activityType));
    
    if (!shouldShow) {
        if (timerElem) timerElem.classList.add("hidden");
        updateSeparators();
        return;
    }

    if (timerElem) timerElem.classList.remove("hidden");
    updateSeparators();
}

function filterActivities(activities: any[], timespan: string, activityType: string) {
    if (!activities) return [];
    
    let filtered = activities.filter(activity => !EXCLUDED_ACTIVITIES.includes(activity.activityHash));
    
    const cacheKey = `${timespan}_${activityType}_${prefs?.useRealTime}_${currentCustomStartDate}_${filtered.length}`;
    const now = Date.now();
    
    if (cachedFilteredActivities.length > 0 && 
        lastFilterCacheKey === cacheKey && 
        (now - lastFilterCacheTime) < FILTER_CACHE_DURATION) {
        return cachedFilteredActivities;
    }
    
    filtered = [...filtered];
    const activityDate = (period: string) => new Date(period);
    
    if (prefs.useRealTime) {
        const oneDayMs = 24 * 60 * 60 * 1000;
        const cutoffs = {
            '1': new Date(now - oneDayMs),
            '7': new Date(now - 7 * oneDayMs),
            '30': new Date(now - 30 * oneDayMs)
        };
        
        if (timespan === '1' || timespan === '7' || timespan === '30') {
            const cutoff = cutoffs[timespan as keyof typeof cutoffs];
            filtered = filtered.filter(activity => activityDate(activity.period) >= cutoff);
        } else if (timespan === 'custom' && currentCustomStartDate) {
            const cutoff = new Date(currentCustomStartDate);
            filtered = filtered.filter(activity => activityDate(activity.period) >= cutoff);
        }
    } else {
        const nowDate = new Date(now);
        
        if (timespan === '1') {
            const today = new Date(nowDate);
            today.setUTCHours(17, 0, 0, 0);
            if (today > nowDate) {
                today.setUTCDate(today.getUTCDate() - 1);
            }
            filtered = filtered.filter(activity => activityDate(activity.period) >= today);
        } else if (timespan === '7') {
            const day = nowDate.getUTCDay();
            const daysSinceTuesday = (day + 5) % 7;
            const lastTuesday = new Date(nowDate);
            lastTuesday.setUTCDate(nowDate.getUTCDate() - daysSinceTuesday);
            lastTuesday.setUTCHours(17, 0, 0, 0);
            filtered = filtered.filter(activity => activityDate(activity.period) >= lastTuesday);
        } else if (timespan === '30') {
            const day = nowDate.getUTCDay();
            const daysSinceTuesday = (day + 5) % 7;
            const lastTuesday = new Date(nowDate);
            lastTuesday.setUTCDate(nowDate.getUTCDate() - daysSinceTuesday);
            const targetDate = new Date(lastTuesday);
            targetDate.setUTCDate(lastTuesday.getUTCDate() - 21);
            targetDate.setUTCHours(17, 0, 0, 0);
            filtered = filtered.filter(activity => activityDate(activity.period) >= targetDate);
        } else if (timespan === 'custom' && currentCustomStartDate) {
            const selectedDate = new Date(currentCustomStartDate);
            selectedDate.setUTCHours(17, 0, 0, 0);
            if (selectedDate > nowDate) {
                selectedDate.setUTCDate(selectedDate.getUTCDate() - 1);
            }
            filtered = filtered.filter(activity => activityDate(activity.period) >= selectedDate);
        }
    }
    
    if (activityType === 'all') return filtered;
    
    if (activityType.startsWith('grouped-raid-')) {
        const groupKey = activityType.replace('grouped-raid-', '');
        const groupData = (GROUPED_RAIDS as Record<string, { name: string; hashes: number[] }>)[groupKey];
        if (groupData) {
            return filtered.filter(activity => 
                groupData.hashes.includes(activity.activityHash)
            );
        }
    }
    
    if (activityType.startsWith('grouped-dungeon-')) {
        const groupKey = activityType.replace('grouped-dungeon-', '');
        const groupData = (GROUPED_DUNGEONS as Record<string, { name: string; hashes: number[] }>)[groupKey];
        if (groupData) {
            return filtered.filter(activity => 
                groupData.hashes.includes(activity.activityHash)
            );
        }
    }
    
    if (activityType.startsWith('raid-')) {
        const raidHash = parseInt(activityType.split('-')[1]);
        return filtered.filter(activity => activity.activityHash === raidHash);
    }
    
    if (activityType.startsWith('dungeon-')) {
        const dungeonHash = parseInt(activityType.split('-')[1]);
        return filtered.filter(activity => activity.activityHash === dungeonHash);
    }
    
    return filtered.filter(activity => {
        const type = determineActivityType(activity.modes);
        if (!type) return false;
        if (activityType === 'raids') return type === 'Raid';
        if (activityType === 'dungeons') return type === 'Dungeon';
        if (activityType === 'strikes') return type === 'Strike';
        if (activityType === 'lost-sectors') return type === 'Lost Sector';
        if (activityType === 'story') return type === 'Story';
        return true;
    });
    cachedFilteredActivities = filtered;
    lastFilterCacheKey = cacheKey;
    lastFilterCacheTime = now;
    
    return filtered;
}

function refresh(playerDataStatus: PlayerDataStatus) {
    let playerData = playerDataStatus?.lastUpdate;

    if (playerDataStatus?.error) {
        widgetContentElem.classList.add("hidden");
        loaderElem.classList.add("hidden");
        errorElem.classList.remove("hidden");
        
        currentActivity = null;
        doneInitialRefresh = false;
        
        createPopup({ title: "Error", subtext: playerDataStatus.error });
        return;
    }

    if (!playerData) {
        widgetContentElem.classList.add("hidden");
        errorElem.classList.add("hidden");
        loaderElem.classList.remove("hidden");

        currentActivity = null;
        doneInitialRefresh = false;

        return;
    }

    loaderElem.classList.add("hidden");
    errorElem.classList.add("hidden");
    widgetContentElem.classList.remove("hidden");

    currentActivity = playerData.currentActivity;

    checkTimerVisibility();

    cachedPlayerData = playerDataStatus;
    lastPlayerDataCheck = Date.now();
    
    const filteredActivities = filterActivities(playerData.activityHistory, currentTimespan, currentActivityType);
    dailyElem.innerText = String(countClears(filteredActivities));

    if (prefs.displayAverageClearTimeOverlay) {
        const averageTime = calculateAverageClearTime(filteredActivities);
        averageTimeTextElem.innerHTML = formatAverageTime(averageTime);
    }

    let latestRaid = filteredActivities[0];
    
    if (doneInitialRefresh && latestRaid?.completed && lastRaidId != latestRaid.instanceId && prefs.displayClearNotifications && !playerDataStatus.historyLoading) {
        const type = determineActivityType(latestRaid.modes);

        if (type) {
            let typeFormatted = type.charAt(0).toUpperCase() + type.slice(1);
            if (type === "Strike") typeFormatted = "Strike / Portal";
            
            let activityName = null;
            if (type === "Raid" && latestRaid.activityHash && latestRaid.activityHash in KNOWN_RAIDS) {
                activityName = KNOWN_RAIDS[latestRaid.activityHash as keyof typeof KNOWN_RAIDS];
            } else if (type === "Dungeon" && latestRaid.activityHash && latestRaid.activityHash in KNOWN_DUNGEONS) {
                activityName = KNOWN_DUNGEONS[latestRaid.activityHash as keyof typeof KNOWN_DUNGEONS];
            }
            
            const title = activityName ? activityName : typeFormatted;
            createPopup({ title, subtext: `API Time: <strong>${latestRaid.activityDuration}</strong>` });
        }
    }

    lastRaidId = latestRaid?.instanceId;

    if (!doneInitialRefresh) {
        createPopup({ title: `${playerData.profileInfo.displayName}#${playerData.profileInfo.displayTag}`, subtext: "groundsub is active." });
    }

    doneInitialRefresh = true;
}

function applyPreferences(p: Preferences) {
    const useRealTimeChanged = prefs && p.useRealTime !== prefs.useRealTime;
    const averageTimeDisplayChanged = prefs && p.displayAverageClearTimeOverlay !== prefs.displayAverageClearTimeOverlay;
    prefs = p;

    if (useRealTimeChanged) {
        clearFilterCache();
    }

    if (counterElem) {
        if (p.displayDailyClears) {
            counterElem.classList.remove("hidden");
        } else {
            counterElem.classList.add("hidden");
        }
    }

    if (averageTimeElem) {
        if (p.displayAverageClearTimeOverlay) {
            averageTimeElem.classList.remove("hidden");
        } else {
            averageTimeElem.classList.add("hidden");
        }
    }

    if (averageTimeDisplayChanged && p.displayAverageClearTimeOverlay) {
        (async () => {
            const playerData = await getPlayerdata();
            if (playerData && cachedPlayerData?.lastUpdate) {
                const filteredActivities = filterActivities(cachedPlayerData.lastUpdate.activityHistory, currentTimespan, currentActivityType);
                const averageTime = calculateAverageClearTime(filteredActivities);
                averageTimeTextElem.innerHTML = formatAverageTime(averageTime);
            }
        })();
    }
    
    if (msElem) {
        if (p.displayMilliseconds) {
            msElem.classList.remove("hidden");
        } else {
            msElem.classList.add("hidden");
        }
    }

    const svgs = document.querySelectorAll<SVGElement>("#widget-content svg:not(#now-playing > svg)");
    svgs.forEach(svg => {
        if (p.displayIcons) {
            svg.classList.remove("hidden");
        } else {
            svg.classList.add("hidden");
        }
    });

    if (widgetElem) {
        widgetElem.classList.remove("position-left", "position-right", "position-bottom-left", "position-bottom-right");
        
        if (p.overlayPosition === "right") {
            widgetElem.classList.add("position-right");
        } else if (p.overlayPosition === "bottom-left") {
            widgetElem.classList.add("position-bottom-left");
        } else if (p.overlayPosition === "bottom-right") {
            widgetElem.classList.add("position-bottom-right");
        } else {
            widgetElem.classList.add("position-left");
        }

        const offsetX = p.customOverlayX !== undefined ? p.customOverlayX : 5;
        const offsetY = p.customOverlayY !== undefined ? p.customOverlayY : 5;

        const finalOffsetX = (p.overlayPosition === "right" || p.overlayPosition === "bottom-right") ? -offsetX : offsetX;
        const finalOffsetY = (p.overlayPosition === "bottom-left" || p.overlayPosition === "bottom-right") ? -offsetY : offsetY;
        
        widgetElem.style.transform = `translate(${finalOffsetX}px, ${finalOffsetY}px)`;
    }

    if (useRealTimeChanged) {
        updateTimespanText();
        (async () => {
            const playerData = await getPlayerdata();
            if (playerData) {
                refresh(playerData);
            }
        })();
    }

    if (currentMediaInfo) {
        updateNowPlaying(currentMediaInfo);
    }

    checkTimerVisibility();
    updateNowPlayingVisibility();
    updateSeparators();
}

function updateSeparators() {
    if (!widgetContentElem) return;
    const children = widgetContentElem.querySelectorAll(':scope > div');
    let firstVisibleFound = false;
    children.forEach(child => {
        if (child.classList.contains('hidden')) return;
        if (!firstVisibleFound) {
            child.classList.add('no-separator');
            firstVisibleFound = true;
        } else {
            child.classList.remove('no-separator');
        }
    });
}

function updateNowPlaying(mediaInfo: MediaInfo) {
    currentMediaInfo = mediaInfo;
    
    if (!mediaInfo.hasMedia) {
        nowPlayingElem.classList.add("hidden");
        nowPlayingIconElem.classList.add("hidden");
        nowPlayingTitleElem.textContent = '';
        nowPlayingArtistElem.textContent = '';
        return;
    }

    if (prefs?.displayNowPlaying) {
        nowPlayingTitleElem.textContent = mediaInfo.title || '';
        nowPlayingArtistElem.textContent = mediaInfo.artist || '';
    } else {
        nowPlayingTitleElem.textContent = '';
        nowPlayingArtistElem.textContent = '';
    }
    
    if (prefs?.displayNowPlaying && prefs?.displayIcons) {
        nowPlayingIconElem.classList.remove("hidden");
    } else {
        nowPlayingIconElem.classList.add("hidden");
    }
    
    updateNowPlayingVisibility();
}

function updateNowPlayingVisibility() {
    if (!prefs || !nowPlayingElem) return;
    
    if (prefs.displayNowPlaying && currentMediaInfo?.hasMedia) {
        const hasContent = (nowPlayingTitleElem.textContent && nowPlayingTitleElem.textContent.length > 0) ||
                          (nowPlayingArtistElem.textContent && nowPlayingArtistElem.textContent.length > 0);
        if (hasContent) {
            nowPlayingElem.classList.remove("hidden");
        } else {
            nowPlayingElem.classList.add("hidden");
        }
    } else {
        nowPlayingElem.classList.add("hidden");
    }
    updateSeparators();
}

init();
