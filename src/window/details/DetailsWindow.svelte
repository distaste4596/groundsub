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
        calculateAverageClearTime,
        formatTimeWithUnit,
        calculateDifferenceFromAverage,
        formatDifference,
        resolveActivityName,
    } from "../../core/util";
    import { KNOWN_RAIDS, KNOWN_DUNGEONS, GROUPED_RAIDS, GROUPED_DUNGEONS, ACTIVITY_ALIASES, REPOSITORY_LINK, BUNGIE_API_STATUS, REPOSITORY_LINK_ISSUES, EXCLUDED_ACTIVITIES } from "../../core/consts";
    import PreviousRaid from "./PreviousRaid.svelte";
    import Dot from "./Dot.svelte";
    import Loader from "../widgets/Loader.svelte";
    import SearchableSelect from "./SearchableSelect.svelte";
    import ActionButtons from "./ActionButtons.svelte";
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

    let playerData: PlayerData | null = null;
    let error: string | null = null;
    let historyLoading = false;
    let dataUpdateTimestamp = 0;
    $: countedClears = playerData ? countClears(playerData.activityHistory) : 0;
    let showBanner = false;
    let preferences: Preferences = {
        enableOverlay: false,
        displayTimer: false,
        displayDailyClears: false,
        displayAverageClearTimeOverlay: false,
        displayIcons: false,
        displayClearNotifications: false,
        displayMilliseconds: false,
        showTimestampInstead: false,
        useRealTime: false,
        displayAverageClearTimeDetails: false,
        displayDifferenceIndicator: false,
        primaryBackground: '',
        secondaryBackground: '',
        primaryHighlight: '',
        clearTextColor: '',
        incompleteColor: '#ff6b6b',
        completedColor: '#51cf66',
        filterActivityType: 'all',
        filterTimespan: '1',
        timerMode: 'default',
        raidLinkProvider: 'raid.report',
        overlayPosition: 'left',
        customOverlayX: 0,
        customOverlayY: 0,
        customStartDate: '',
        displayNowPlaying: false
    };

    let activityInfoMap: { [hash: number]: ActivityInfo } = {};
    let selectedActivityType = 'all';
    let selectedTimespan: '1' | '7' | '30' | 'custom' = '1';
    let customStartDate: string = '';
    let hiddenDateInput: HTMLInputElement;
    let saveTimeout: number;
    let filterTimeout: number;
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
        { value: '30', label: preferences.useRealTime ? 'Last 30d' : 'This Month' },
        { value: 'custom', label: 'Date' }
    ];

    $: timespanDisplayLabel = selectedTimespan === 'custom' && customStartDate ? (() => {
        const date = new Date(customStartDate);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${month}-${day}`;
    })() : timespanOptions.find(opt => opt.value === selectedTimespan)?.label || 'Date';

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
        if (queryLower === '') return getAllActivityOptions().slice(0, 5);
        
        const allOptions = getAllActivityOptions();
        const results: { value: string; label: string }[] = [];
        const seen = new Set<string>();

        if (queryLower.length < 2) {
            return allOptions
                .filter(option => option.label.toLowerCase().startsWith(queryLower))
                .slice(0, 5);
        }

        for (const option of allOptions) {
            if (option.label.toLowerCase() === queryLower) {
                results.push(option);
                seen.add(option.value);
                break;
            }
        }

        for (const [alias, groupKey] of Object.entries(ACTIVITY_ALIASES as Record<string, string>)) {
            if (alias.startsWith(queryLower) && !seen.has(groupKey)) {
                const isRaid = GROUPED_RAIDS[groupKey];
                const groupData = isRaid ? GROUPED_RAIDS[groupKey] : GROUPED_DUNGEONS[groupKey];
                if (groupData) {
                    const optionValue = `${isRaid ? 'grouped-raid' : 'grouped-dungeon'}-${groupKey}`;
                    results.push({ value: optionValue, label: groupData.name });
                    seen.add(optionValue);
                }
            }
        }

        for (const option of allOptions) {
            if (!seen.has(option.value) && option.label.toLowerCase().includes(queryLower)) {
                results.push(option);
                seen.add(option.value);
            }
        }

        return results.slice(0, 5);
    }

    function debouncedFilterActivities() {
        if (filterTimeout) {
            clearTimeout(filterTimeout);
        }
        filterTimeout = setTimeout(() => {
            filteredActivities = playerData ? filterActivities([...playerData.activityHistory], selectedActivityType, selectedTimespan) : [];
        }, 100);
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
            } else if (timespan === 'custom' && customStartDate) {
                const cutoff = new Date(customStartDate);
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
                if (lastTuesday > now) {
                    lastTuesday.setUTCDate(lastTuesday.getUTCDate() - 7);
                }
                filtered = filtered.filter(activity => activityDate(activity.period) >= lastTuesday);
            } else if (timespan === '30') {
                const today = new Date(now);
                const day = today.getUTCDay();
                const daysSinceTuesday = (day + 5) % 7;
                const lastTuesday = new Date(today);
                lastTuesday.setUTCDate(today.getUTCDate() - daysSinceTuesday);
                lastTuesday.setUTCHours(17, 0, 0, 0);
                if (lastTuesday > now) {
                    lastTuesday.setUTCDate(lastTuesday.getUTCDate() - 7);
                }
                const targetDate = new Date(lastTuesday);
                targetDate.setUTCDate(lastTuesday.getUTCDate() - 21);
                filtered = filtered.filter(activity => activityDate(activity.period) >= targetDate);
            } else if (timespan === 'custom' && customStartDate) {
                const selectedDate = new Date(customStartDate);
                selectedDate.setUTCHours(17, 0, 0, 0);
                if (selectedDate > now) {
                    selectedDate.setUTCDate(selectedDate.getUTCDate() - 1);
                }
                filtered = filtered.filter(activity => activityDate(activity.period) >= selectedDate);
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

    let currentTime = new Date();

    function scheduleNextMidnightUpdate() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();
        
        setTimeout(() => {
            currentTime = new Date();
            scheduleNextMidnightUpdate();
        }, msUntilMidnight);
    }
    
    scheduleNextMidnightUpdate();

    $: minDate = (() => {
        const now = currentTime;
        if (preferences.useRealTime) {
            return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        } else {
            const day = now.getUTCDay();
            const daysSinceTuesday = (day + 5) % 7;
            const lastTuesday = new Date(now);
            lastTuesday.setUTCDate(now.getUTCDate() - daysSinceTuesday);
            lastTuesday.setUTCHours(17, 0, 0, 0);
            if (lastTuesday > now) {
                lastTuesday.setUTCDate(lastTuesday.getUTCDate() - 7);
            }
            const targetDate = new Date(lastTuesday);
            targetDate.setUTCDate(lastTuesday.getUTCDate() - 21);
            return targetDate.toISOString().split('T')[0];
        }
    })();

    $: maxDate = (() => {
        const d = currentTime;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    })();

    $: if (customStartDate && customStartDate < minDate) {
        customStartDate = minDate;
    }

    let filteredActivities: CompletedActivity[] = [];
    $: if (playerData && selectedActivityType && selectedTimespan) {
        debouncedFilterActivities();
    }
    $: if (selectedTimespan === 'custom' && customStartDate) {
        debouncedFilterActivities();
    }
    $: filteredClears = filteredActivities.filter(a => a.completed).length;
    $: averageClearTime = calculateAverageClearTime(filteredActivities);

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
            activityType: selectedActivityType,
            customStartDate: selectedTimespan === 'custom' ? customStartDate : undefined
        }).catch(console.error);
    }

    $: activityType = determineActivityType(
        playerData?.currentActivity?.activityInfo?.activityModes || []
    )

    $: isInOrbit = playerData?.currentActivity?.activityHash === 0;

    $: if (!isInOrbit && playerData?.currentActivity?.activityInfo && activityType) {
        if (timerMode !== 'persistent' ||
            (lastTrackedActivityName !== resolveActivityName(playerData.currentActivity.activityHash, playerData.currentActivity.activityInfo.name))) {
            lastTrackedActivityName = resolveActivityName(playerData.currentActivity.activityHash, playerData.currentActivity.activityInfo.name);
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
        playerData = status?.lastUpdate ?? null;
        error = status?.error ?? null;
        historyLoading = status?.historyLoading || false;
        dataUpdateTimestamp = Date.now();

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
            filterTimespan: selectedTimespan.toString(),
            customStartDate: customStartDate
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
    $: if (customStartDate) {
        debouncedSavePreferences();
    }

    async function init() {
        const savedPrefs = await ipc.getPreferences();
        preferences = savedPrefs;
        document.documentElement.style.setProperty('--primary-background', savedPrefs.primaryBackground);
        document.documentElement.style.setProperty('--secondary-background', savedPrefs.secondaryBackground);
        selectedActivityType = savedPrefs.filterActivityType || 'all';
        selectedTimespan = (savedPrefs.filterTimespan || '1') as '1' | '7' | '30' | 'custom';
        customStartDate = savedPrefs.customStartDate || '';
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
                        <li>• Restarting groundsub</li>
                        <li>• Restarting your computer / router</li>
                        <li>• Checking the Bungie API status <a href="{BUNGIE_API_STATUS}" target="_blank" rel="noopener noreferrer">here</a></li>
                        <li>• Opening an issue on GitHub <a href="{REPOSITORY_LINK_ISSUES}" target="_blank" rel="noopener noreferrer">here</a></li>
                        <li>• Messaging me on discord: xxccss</li>
                    </ul>
                </div>
            </div>
            <ActionButtons 
                showTimerButtons={false}
                {timerMode}
                {refreshPersistentTimer}
                {toggleTimerMode}
            />
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
                            {resolveActivityName(playerData.currentActivity.activityHash, playerData.currentActivity.activityInfo.name).toUpperCase()}
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
            <ActionButtons 
                showTimerButtons={true} 
                {timerMode}
                {refreshPersistentTimer}
                {toggleTimerMode}
            />
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
                            width="132px"
                        />
                    </div>
                    <div class="filter-group">
                        <SearchableSelect
                            bind:value={selectedTimespan}
                            options={timespanOptions}
                            searchable={false}
                            width="90px"
                            customDisplayLabel={timespanDisplayLabel}
                        />
                    </div>
                    {#if selectedTimespan === 'custom'}
                        <div class="filter-group">
                            <input
                                type="date"
                                bind:value={customStartDate}
                                class="calendar-input"
                                min={minDate}
                                max={maxDate}
                                on:selectstart|preventDefault
                                on:mousedown|preventDefault
                            />
                        </div>
                    {/if}
                    <div class="stats-row">
                    {#if preferences.displayAverageClearTimeDetails}
                    <div class="avg-time-box">
                        Average: {formatTimeWithUnit(averageClearTime)}
                    </div>
                    {/if}
                    <div class="clear-counters">
                        <span class="item">
                            <Dot completed={true} />{filteredClears}
                        </span>
                        <span class="item">
                            <Dot completed={false} />{filteredActivities.length - filteredClears}
                        </span>
                    </div>
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
                        displayDifferenceIndicator={preferences.displayDifferenceIndicator}
                        averageTime={averageClearTime}
                    />
                {/each}
                {#if filteredActivities.length == 0}
                    <p class="list-empty">
                        {#if selectedTimespan === '1'}
                            {preferences.useRealTime ? 'No activities completed in the last 24 hours.' : 'No activities completed today.'}
                        {:else if selectedTimespan === '7'}
                            {preferences.useRealTime ? 'No activities completed in the last 7 days.' : 'No activities completed this week.'}
                        {:else if selectedTimespan === 'custom'}
                            {customStartDate ? `No activities completed since ${new Date(customStartDate).toLocaleDateString()}.` : 'Please select a start date.'}
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
        flex: 0 0 auto;
    }


    .stats-row {
        display: flex;
        gap: 3px;
        align-items: center;
        flex: 1 0 auto;
        justify-content: flex-end;
    }

    .avg-time-box {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border-radius: 0;
        border: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 13px;
        font-weight: 500;
        white-space: nowrap;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        transition: all 0.1s ease;
        box-sizing: border-box;
        min-width: 100px;
    }

    .clear-counters {
        display: flex;
        gap: 8px;
        font-size: 13px;
        padding: 4px 6px;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border-radius: 0;
        border: 1px solid rgba(255, 255, 255, 0.06);
        white-space: nowrap;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        transition: all 0.1s ease;
        min-width: fit-content;
    }

    .clear-counters .item {
        display: flex;
        align-items: center;
        min-width: fit-content;
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
            var(--primary-background),
            var(--secondary-background)
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

    .calendar-input {
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        padding: 0;
        color: transparent;
        font-size: 0;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        box-sizing: border-box;
        height: 32px;
        width: 32px;
        overflow: hidden;
        position: relative;
    }

    .calendar-input::-webkit-calendar-picker-indicator {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 24px;
        height: 24px;
        cursor: pointer;
        background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke-width='1.5' stroke='white'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5m-9-6h.008v.008H12v-.008ZM12 15h.008v.008H12V15Zm0 2.25h.008v.008H12v-.008ZM9.75 15h.008v.008H9.75V15Zm0 2.25h.008v.008H9.75v-.008ZM7.5 15h.008v.008H7.5V15Zm0 2.25h.008v.008H7.5v-.008Zm6.75-4.5h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V15Zm0 2.25h.008v.008h-.008v-.008Zm2.25-4.5h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5V15Z'/%3E%3C/svg%3E") no-repeat center;
        background-size: contain;
        filter: none;
    }

    .calendar-input::-webkit-inner-spin-button,
    .calendar-input::-webkit-clear-button {
        display: none;
    }

    .calendar-input:focus {
        outline: none;
        border-color: var(--primary-highlight, #4a9eff);
        box-shadow: 0 0 0 1px var(--primary-highlight, #4a9eff);
    }

    .calendar-input:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }
</style>
