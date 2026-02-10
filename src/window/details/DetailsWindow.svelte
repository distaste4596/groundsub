<script lang="ts">
    import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
    import { listen } from "@tauri-apps/api/event";
    import type {
        ActivityInfo,
        PlayerData,
        PlayerDataStatus,
        TauriEvent,
        CompletedActivity,
        Preferences
    } from "../../core/types";
    import {
        countClears,
        determineActivityType,
        formatMillis,
        formatTime,
    } from "../../core/util";
    import { KNOWN_RAIDS, KNOWN_DUNGEONS, GROUPED_RAIDS, GROUPED_DUNGEONS, ACTIVITY_ALIASES, REPOSITORY_LINK, BUNGIE_API_STATUS, REPOSITORY_LINK_ISSUES, EXCLUDED_ACTIVITIES } from "../../core/consts";
    import PreviousRaid from "./PreviousRaid.svelte";
    import Dot from "./Dot.svelte";
    import Loader from "../widgets/Loader.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import * as ipc from "../../core/ipc";
    import { emit } from '@tauri-apps/api/event';

    let timerState: {
        timeText: string;
        msText: string;
        isActive: boolean;
        mode: 'default' | 'persistent';
    } = {
        timeText: "",
        msText: "",
        isActive: false,
        mode: 'default'
    };
    let timerMode: 'default' | 'persistent' = 'default';
    let lastTrackedActivityName: string = '';
    let lastTrackedActivityType: string = '';
    let lastProfileKey: string = '';

    let playerData: PlayerData | null | undefined;
    let error: string | null | undefined;
    let historyLoading: boolean = false;
    $: countedClears = playerData ? countClears(playerData.activityHistory) : 0;
    let showBanner = false;
    let preferences: Preferences = {
        enableOverlay: false,
        displayTimer: false,
        displayDailyClears: false,
        displayIcons: false,
        displayClearNotifications: false,
        displayMilliseconds: false,
        showTimestampInstead: false,
        useRealTime: false,
        primaryBackground: '',
        secondaryBackground: '',
        primaryHighlight: '',
        clearTextColor: '',
        filterActivityType: 'all',
        filterTimespan: '1',
        timerMode: 'default',
        raidLinkProvider: 'raid.report',
        overlayPosition: 'left',
        customOverlayX: 0,
        customOverlayY: 0
    };

    let activityInfoMap: { [hash: number]: ActivityInfo } = {};
    let selectedActivityType = 'all';
    let selectedTimespan: '1' | '7' | '30' = '1';
    let saveTimeout: number;
    $: activityOptions = [
        { value: 'all', label: 'All Activities' },
        { value: 'raids', label: 'Raids' },
        { value: 'dungeons', label: 'Dungeons' },
        { value: 'strikes', label: 'Strikes / Portal' },
        { value: 'lost-sectors', label: 'Lost Sectors' },
        { value: 'story', label: 'Story Missions' },
    ];

    $: timespanOptions = [
        { value: '1', label: preferences.useRealTime ? 'Last 24h' : 'Today' },
        { value: '7', label: preferences.useRealTime ? 'Last 7d' : 'This Week' },
        { value: '30', label: preferences.useRealTime ? 'Last 30d' : 'This Month' }
    ];

    function getAllActivityOptions() {
        const specificOptions = [
            ...Object.entries(GROUPED_RAIDS).map(([key, data]) => ({
                value: `grouped-raid-${key}`,
                label: data.name
            })),
            ...Object.entries(GROUPED_DUNGEONS).map(([key, data]) => ({
                value: `grouped-dungeon-${key}`,
                label: data.name
            }))
        ];
        return [...activityOptions, ...specificOptions];
    }

    function searchActivities(query: string) {
        const queryLower = query.toLowerCase().trim();
        const allOptions = getAllActivityOptions();

        if (queryLower === '') return allOptions.slice(0, 5);
        const matches = new Set<string>();
        const results: { value: string; label: string }[] = [];

        Object.entries(ACTIVITY_ALIASES as Record<string, string>).forEach(([alias, groupKey]) => {
            if (alias.startsWith(queryLower)) {
                const isRaid = GROUPED_RAIDS[groupKey];
                const groupData = isRaid ? GROUPED_RAIDS[groupKey] : GROUPED_DUNGEONS[groupKey];
                if (groupData && !matches.has(groupKey)) {
                    matches.add(groupKey);
                    results.push({
                        value: `${isRaid ? 'grouped-raid' : 'grouped-dungeon'}-${groupKey}`,
                        label: groupData.name
                    });
                }
            }
        });

        allOptions.forEach(option => {
            if (option.label.toLowerCase().includes(queryLower) && !matches.has(option.value)) {
                results.push(option);
            }
        });

        return results.slice(0, 5);
    }

    function filterActivities(activities: CompletedActivity[], type: string, timespan: string) {
        let filtered = activities.filter(activity => !EXCLUDED_ACTIVITIES.includes(activity.activityHash));

        const now = new Date();
        const activityDate = (period: string) => new Date(period);

        if (preferences.useRealTime) {
            if (timespan === '1') {
                const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                filtered = filtered.filter(activity => activityDate(activity.period) >= cutoff);
            } else if (timespan === '7') {
                const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                filtered = filtered.filter(activity => activityDate(activity.period) >= cutoff);
            } else if (timespan === '30') {
                const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                filtered = filtered.filter(activity => activityDate(activity.period) >= cutoff);
            }
        } else {
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
            } else if (timespan === '30') {
                const today = new Date(now);
                const day = today.getUTCDay();
                const daysSinceTuesday = (day + 5) % 7;
                const lastTuesday = new Date(today);
                lastTuesday.setUTCDate(today.getUTCDate() - daysSinceTuesday);
                const targetDate = new Date(lastTuesday);
                targetDate.setUTCDate(lastTuesday.getUTCDate() - 21);
                targetDate.setUTCHours(17, 0, 0, 0);
                filtered = filtered.filter(activity => activityDate(activity.period) >= targetDate);
            }
        }

        if (type === 'all') return filtered;

        if (type.startsWith('grouped-raid-')) {
            const groupKey = type.replace('grouped-raid-', '');
            const groupData = (GROUPED_RAIDS as Record<string, { name: string; hashes: number[] }>)[groupKey];
            if (groupData) {
                return filtered.filter(activity =>
                    groupData.hashes.includes(activity.activityHash)
                );
            }
        }

        if (type.startsWith('grouped-dungeon-')) {
            const groupKey = type.replace('grouped-dungeon-', '');
            const groupData = (GROUPED_DUNGEONS as Record<string, { name: string; hashes: number[] }>)[groupKey];
            if (groupData) {
                return filtered.filter(activity =>
                    groupData.hashes.includes(activity.activityHash)
                );
            }
        }

        if (type.startsWith('raid-')) {
            const raidHash = parseInt(type.split('-')[1]);
            return filtered.filter(activity => activity.activityHash === raidHash);
        }

        if (type.startsWith('dungeon-')) {
            const dungeonHash = parseInt(type.split('-')[1]);
            return filtered.filter(activity => activity.activityHash === dungeonHash);
        }

        return filtered.filter(activity => {
            const activityType = determineActivityType(activity.modes);
            if (!activityType) return false;
            if (type === 'raids') return activityType === 'Raid';
            if (type === 'dungeons') return activityType === 'Dungeon';
            if (type === 'strikes') return activityType === 'Strike';
            if (type === 'lost-sectors') return activityType === 'Lost Sector';
            if (type === 'story') return activityType === 'Story';
            return true;
        });
    }

    $: filteredActivities = playerData ? filterActivities(playerData.activityHistory, selectedActivityType, selectedTimespan) : [];
    $: filteredClears = filteredActivities.filter(a => a.completed).length;

    $: if (filteredActivities.length > 0) {
        filteredActivities.forEach(activity => {
            if (!activityInfoMap[activity.activityHash]) {
                getActivityInfoAsync(activity.activityHash);
            }
        });
    }

    $: if (playerData && selectedTimespan) {
        emit('filter-changed', {
            timespan: selectedTimespan,
            activityType: selectedActivityType
        }).catch(console.error);
    }

    $: activityType = determineActivityType(
        playerData?.currentActivity?.activityInfo?.activityModes || []
    )

    $: isInOrbit = playerData?.currentActivity?.activityHash === 0;

    $: if (!isInOrbit && playerData?.currentActivity?.activityInfo && activityType) {
        if (timerMode !== 'persistent' ||
            (lastTrackedActivityName !== playerData.currentActivity.activityInfo.name)) {
            lastTrackedActivityName = playerData.currentActivity.activityInfo.name;
            lastTrackedActivityType = activityType;
        }
    } else if (isInOrbit) {
    }

    listen('timer-state-update', (event: any) => {
        timerState = event.payload;
        timerMode = event.payload.mode;
    });

    function toggleTimerMode() {
        const newMode = timerMode === 'default' ? 'persistent' : 'default';
        timerMode = newMode;

        ipc.setTimerMode(newMode).catch(console.error);
        saveTimerModeToConfig(newMode);
    }

    function refreshPersistentTimer() {
        ipc.clearAndRestartTimer().catch(console.error);
        lastTrackedActivityName = '';
        lastTrackedActivityType = '';
    }

    async function saveTimerModeToConfig(mode: 'default' | 'persistent') {
        try {
            const currentPrefs = await ipc.getPreferences();
            const updatedPrefs = {
                ...currentPrefs,
                timerMode: mode
            };
            await ipc.setPreferences(updatedPrefs);
        } catch (error) {
            console.error('Failed to save timer mode:', error);
        }
    }

    let activityInfoLoadingMap: { [hash: number]: Promise<ActivityInfo> } = {};

    function getActivityInfoAsync(hash: number): Promise<ActivityInfo> {
        if (activityInfoMap[hash]) {
            return Promise.resolve(activityInfoMap[hash]);
        }

        if (!activityInfoLoadingMap[hash]) {
            activityInfoLoadingMap[hash] = ipc.getActivityInfo(hash).then(info => {
                activityInfoMap[hash] = info;
                delete activityInfoLoadingMap[hash];
                return info;
            });
        }

        return activityInfoLoadingMap[hash];
    }

    async function getActivityInfo(hash: number): Promise<ActivityInfo> {
        if (activityInfoMap[hash]) {
            return activityInfoMap[hash];
        }

        let activityInfo = await ipc.getActivityInfo(hash);

        activityInfoMap[hash] = activityInfo;

        return activityInfo;
    }

    function handleUpdate(status: PlayerDataStatus | null) {
        playerData = status?.lastUpdate;
        error = status?.error;
        historyLoading = status?.historyLoading || false;

        let currentActivity = playerData?.currentActivity;
        if (currentActivity?.activityInfo) {
            activityInfoMap[currentActivity.activityHash] =
                currentActivity.activityInfo;
        }
    }

    async function updateAndSavePreferences() {
        const currentPrefs = await ipc.getPreferences();
        const updatedPrefs = {
            ...currentPrefs,
            filterActivityType: selectedActivityType,
            filterTimespan: selectedTimespan.toString()
        };
        await ipc.setPreferences(updatedPrefs);
    }

    function debouncedSavePreferences() {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
            updateAndSavePreferences();
        }, 500);
    }

    $: if (selectedActivityType && selectedTimespan) {
        debouncedSavePreferences();
    }

    async function init() {
        const savedPrefs = await ipc.getPreferences();
        preferences = savedPrefs;
        document.documentElement.style.setProperty('--primary-background', savedPrefs.primaryBackground);
        document.documentElement.style.setProperty('--secondary-background', savedPrefs.secondaryBackground);
        selectedActivityType = savedPrefs.filterActivityType || 'all';
        selectedTimespan = (savedPrefs.filterTimespan || '1') as '1' | '7' | '30';
        timerMode = savedPrefs.timerMode || 'default';
        ipc.setTimerMode(timerMode).catch(console.error);

        handleUpdate(await ipc.getPlayerdata());

        const unlisten = await listen<Preferences>('preferences_update', (event) => {
            const prefs = event.payload;
            preferences = prefs;
            document.documentElement.style.setProperty('--primary-background', prefs.primaryBackground);
            document.documentElement.style.setProperty('--secondary-background', prefs.secondaryBackground);
            if (playerData) {
                playerData = { ...playerData };
            }
        });

        appWindow.listen(
            "playerdata_update",
            (e: TauriEvent<PlayerDataStatus>) => handleUpdate(e.payload)
        );

        setInterval(() => (playerData = playerData), 30000);

        showBanner =
            new URLSearchParams(window.location.search).get("welcome") == "";
    }

    init();
</script>

<main>
    {#if error}
        <div class="header margin">
            <div class="status">
                <h1 class="small">Error</h1>
                <p class="error">{error}</p>
                <div class="error-actions">
                    <p>If this error persists, consider: </p>
                    <ul>
                        <li>- Restarting the groundsub</li>
                        <li>- Restarting your computer / router</li>
                        <li>- Checking the Bungie API status <a href="{BUNGIE_API_STATUS}" target="_blank" rel="noopener noreferrer">here</a></li>
                        <li>- Opening an issue on GitHub <a href="{REPOSITORY_LINK_ISSUES}" target="_blank" rel="noopener noreferrer">here</a></li>
                        <li>- Messaging me on discord: xxccss</li>
                    </ul>
                </div>
            </div>
        </div>
    {:else if playerData}
        {#if showBanner}
            <div class="banner margin">
                <div class="text">
                    <p class="title">Welcome to groundsub!</p>
                    <p>
                        The overlay is disabled by default, and can be enabled
                        in preferences.
                    </p>
                </div>
                <button on:click={() => (showBanner = false)}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="20"
                        width="20"
                    >
                        <path
                            d="M6.062 15 5 13.938 8.938 10 5 6.062 6.062 5 10 8.938 13.938 5 15 6.062 11.062 10 15 13.938 13.938 15 10 11.062Z"
                        />
                    </svg>
                </button>
            </div>
        {/if}
        <div class="header margin">
            <div class="status">
                {#if playerData}
                    {#if timerMode === 'persistent' && timerState.timeText === "--:--:--"}
                        <h1>{timerState.timeText}<span class="small grey">{timerState.msText}</span></h1>
                        <h2 class="grey">WAITING FOR NEW ACTIVITY</h2>
                    {:else if activityType && timerState.timeText !== ""}
                        <h1>
                            {timerState.timeText}<span class="small grey">{timerState.msText}</span>
                        </h1>
                        <h2 class="grey">
                            {playerData.currentActivity.activityInfo.name.toUpperCase()}
                        </h2>
                    {:else if timerMode === 'persistent' && lastTrackedActivityName && timerState.timeText !== "" && (timerState.isActive || isInOrbit)}
                        <h1>{timerState.timeText}<span class="small grey">{timerState.msText}</span></h1>
                        <h2 class="grey">{lastTrackedActivityName.toUpperCase()}</h2>
                    {:else}
                        <h1 class="small">
                            {playerData.profileInfo.displayName}<span
                                class="grey"
                                >#{playerData.profileInfo.displayTag}</span
                            >
                        </h1>
                        <h2 class="grey">NOT IN ACTIVITY</h2>
                    {/if}
                {/if}
            </div>
            <div class="actions">
                {#if timerMode === 'persistent'}
                    <button on:click={refreshPersistentTimer} class="refresh-timer-btn" title="Resets the timer to current activity">
                        <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>
                    </button>
                {/if}
                <button on:click={toggleTimerMode} class="timer-mode-btn">
                    {timerMode === 'persistent' ? 'Persistent Timer' : 'Default Timer'}
                </button>
                <button on:click={() => ipc.openProfiles()}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="24"
                        width="24"
                    ><path
                            d="M12 12q-1.65 0-2.825-1.175Q8 9.65 8 8q0-1.65 1.175-2.825Q10.35 4 12 4q1.65 0 2.825 1.175Q16 6.35 16 8q0 1.65-1.175 2.825Q13.65 12 12 12Zm-8 8v-2.8q0-.85.438-1.563.437-.712 1.162-1.087 1.55-.775 3.15-1.163Q10.35 13 12 13t3.25.387q1.6.388 3.15 1.163.725.375 1.162 1.087Q20 16.35 20 17.2V20Z"
                        /></svg
                    >
                </button>
                <button on:click={() => ipc.openPreferences()}>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="24"
                        width="24"
                    ><path
                            d="m10.125 21-.35-2.9q-.475-.125-1.037-.437Q8.175 17.35 7.8 17l-2.675 1.125-1.875-3.25 2.325-1.75q-.05-.25-.087-.538-.038-.287-.038-.562 0-.25.038-.538.037-.287.087-.612L3.25 9.125l1.875-3.2 2.65 1.1q.45-.375.963-.675.512-.3 1.012-.45l.375-2.9h3.75l.35 2.9q.575.225 1.013.475.437.25.912.65l2.725-1.1 1.875 3.2-2.4 1.8q.1.3.1.563V12q0 .225-.012.488-.013.262-.088.637l2.35 1.75-1.875 3.25-2.675-1.15q-.475.4-.937.675-.463.275-.988.45l-.35 2.9Zm1.85-6.5q1.05 0 1.775-.725.725-.725.725-1.775 0-1.05-.725-1.775-.725-.725-1.775-.725-1.05 0-1.775.725-.725.725-.725 1.775 0 1.05.725 1.775.725.725 1.775.725Z"
                        /></svg
                    >
                </button>
            </div>
        </div>
        {#if playerData}
            <div class="margin">
                <div class="filters">
                    <div class="filter-group">
                        <SearchableSelect
                            bind:value={selectedActivityType}
                            options={activityOptions}
                            getAllOptions={searchActivities}
                            getAllActivityOptions={getAllActivityOptions}
                            placeholder="Search activities..."
                        />
                    </div>
                    <div class="filter-group">
                        <SearchableSelect
                            bind:value={selectedTimespan}
                            options={timespanOptions}
                            searchable={false}
                            width="120px"
                        />
                    </div>
                    <div class="clear-counters">
                        <span class="item">
                            <Dot completed={true} />{filteredClears}
                        </span>
                        <span class="item">
                            <Dot completed={false} />{filteredActivities.length - filteredClears}
                        </span>
                    </div>
                </div>
                <div class="activities-divider"></div>
                {#if historyLoading}
                    {#if playerData?.activityHistory.length === 0}
                        <div class="loading-container">
                            <div class="loading-spinner-fixed">
                                <Loader />
                            </div>
                            <div class="loading-text-dynamic">
                                <p class="loading-text">
                                    Loading activity history...
                                </p>
                            </div>
                        </div>
                    {:else}
                        <div class="loading-container">
                            <div class="loading-text-dynamic">
                                <p class="loading-text">
                                    ({playerData.activityHistory.length} activities loaded)
                                </p>
                            </div>
                        </div>
                    {/if}
                {/if}
                {#each filteredActivities as activity}
                    <PreviousRaid
                        {activity}
                        activityInfo={activityInfoMap[activity.activityHash]}
                        showTimestamp={preferences.showTimestampInstead}
                        raidLinkProvider={preferences.raidLinkProvider}
                    />
                {/each}
                {#if filteredActivities.length == 0}
                    <p class="list-empty">
                        {#if selectedTimespan === '1'}
                            {preferences.useRealTime ? 'No activities completed in the last 24 hours.' : 'No activities completed today.'}
                        {:else if selectedTimespan === '7'}
                            {preferences.useRealTime ? 'No activities completed in the last 7 days.' : 'No activities completed this week.'}
                        {:else}
                            {preferences.useRealTime ? 'No activities completed in the last 30 days.' : 'No activities completed this month.'}
                        {/if}
                    </p>
                {/if}
            </div>
        {/if}
    {:else}
        <div class="loader">
            <Loader />
        </div>
    {/if}
</main>

<style>
    .loader {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .margin {
        margin: 24px 48px;
        padding: 0;
    }

    .filters {
        display: flex;
        gap: 3px;
        margin-bottom: 8px;
        align-items: center;
        flex-wrap: nowrap;
    }

    .filter-group {
        position: relative;
        flex: 0 1 auto;
        min-width: 120px;
        max-width: 160px;
    }


    .clear-counters {
        margin-left: auto;
        display: flex;
        gap: 12px;
        font-size: 13px;
        padding: 4px 10px;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border-radius: 0;
        border: 1px solid rgba(255, 255, 255, 0.06);
        white-space: nowrap;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        transition: all 0.1s ease;
    }

    .activities-divider {
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin: 8px 0;
    }

    .banner {
        display: flex;
        padding: 12px 20px;
        background: linear-gradient(
            45deg,
            var(--primary-highlight),
            var(--primary-highlight)
        );
        align-items: center;
    }

    .banner .text {
        flex: 1;
        font-weight: 300;
        font-size: 14px;
    }

    .banner .text .title {
        margin-bottom: 6px;
        font-weight: 500;
        font-size: 16px;
    }

    .banner button {
        width: 24px;
        height: 24px;
        margin-left: 8px;
        fill: #fff;
        font-size: 0;
        transition: background-color 0.1s;
    }

    .banner button:hover {
        background-color: rgba(0, 0, 0, 0.2);
    }

    .grey {
        color: #aaa;
    }

    h1 {
        font-size: 48px;
        font-weight: 600;
        margin-bottom: 4px;
    }

    h1.small,
    h1 .small {
        font-size: 32px;
    }

    h1.small {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
    }

    h2 {
        font-size: 20px;
        font-weight: 300;
    }

    .header {
        display: flex;
    }

    .status {
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }

    .actions {
        display: flex;
        gap: 3px;
        align-items: flex-start;
        margin-top: 0px;
    }

    .error {
        color: var(--error);
        margin-top: 8px;
    }

    .error-actions {
        margin-top: 20px;
        line-height: 150%;
    }

    .error-actions p {
        margin-bottom: 8px;
        font-size: 16px;
        font-weight: 500;
    }

    .actions button {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        padding: 4px 2px;
        fill: #fff;
        transition: all 0.1s ease;
        font-size: 0;
        vertical-align: middle;
        line-height: 1;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        height: 32px;
        width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .actions button:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .actions button.timer-mode-btn {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        padding: 6px 10px;
        color: var(--text-primary);
        font-size: 13px;
        cursor: pointer;
        transition: all 0.1s ease;
        font-family: inherit;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        height: 32px;
        width: 120px;
        text-align: center;
        fill: #fff;
        line-height: 1;
        vertical-align: middle;
        box-sizing: border-box;
    }

    .actions button.timer-mode-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .refresh-timer-btn {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        padding: 4px;
        fill: #fff;
        transition: all 0.1s ease;
        font-size: 0;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        height: 32px;
        width: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        vertical-align: middle;
    }

    .refresh-timer-btn:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .list-empty {
        text-align: center;
        color: #aaa;
        margin-top: 12px;
        font-size: 14px;
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        gap: 12px;
    }

    .loading-spinner-fixed {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 72px;
    }

    .loading-text-dynamic {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .loading-text {
        color: #aaa;
        font-size: 14px;
        margin: 0;
    }
</style>
