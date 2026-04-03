<script lang="ts">
    import { determineActivityType, calculateDifferenceFromAverage, formatDifference } from "../../core/util";
    import { KNOWN_RAIDS, KNOWN_DUNGEONS } from "../../core/consts";
    import type { ActivityInfo, CompletedActivity, Preferences } from "../../core/types";
    import Dot from "./Dot.svelte";
    import { onMount, onDestroy } from 'svelte';
    import { listen } from "@tauri-apps/api/event";
    import * as ipc from "../../core/ipc";

    export let activity: CompletedActivity;
    export let activityInfo: ActivityInfo | undefined;
    export let showTimestamp = false;
    export let raidLinkProvider: string = 'raid.report';
    export let displayDifferenceIndicator = false;
    export let averageTime = 0;

    let displayText = '';
    let displayName = '';
    let lastActivityHash: number | undefined;
    let isLoading = false;

    $: completedStatus = activity.completed;
    $: difference = displayDifferenceIndicator && completedStatus ? calculateDifferenceFromAverage(activity, averageTime) : 0;
    $: differenceText = displayDifferenceIndicator && completedStatus ? formatDifference(difference) : "";

    $: {
        updateDisplayText();
        if (lastActivityHash !== activity.activityHash) {
            lastActivityHash = activity.activityHash;
            isLoading = true;
            displayName = 'Loading...';
        }
        updateDisplayName();
    }
    $: if (activityInfo) {
        updateDisplayName();
    }

    function updateDisplayText() {
        displayText = getTimeDisplay();
    }

    function updateDisplayName() {
        if (isLoading && activityInfo) {
            isLoading = false;
        }

        if (!activityInfo || isLoading) {
            displayName = 'Loading...';
            return;
        }

        displayName = activityInfo.name;

        const allMasterActivities: Record<number, boolean> = {
            ...Object.entries(KNOWN_RAIDS)
                .filter(([_, name]) => name.includes('(Master)'))
                .reduce((acc, [hash, _]) => ({ ...acc, [parseInt(hash)]: true }), {}),
            ...Object.entries(KNOWN_DUNGEONS)
                .filter(([_, name]) => name.includes('(Master)'))
                .reduce((acc, [hash, _]) => ({ ...acc, [parseInt(hash)]: true }), {})
        };

        if (allMasterActivities[activity.activityHash]) {
            displayName = displayName.replace(/\s*\(Master\)/g, '') + ' (Master)';
        }
    }

    $: reportUrl = (() => {
        const activityType = determineActivityType(activity.modes);

        switch (activityType) {
            case "Dungeon":
                return `https://dungeon.report/pgcr/${activity.instanceId}`;
            case "Raid":
                return `https://${raidLinkProvider}/pgcr/${activity.instanceId}`;
            default:
                return `https://pgcr.report/${activity.instanceId}`;
        }
    })();

    function getTimeDisplay(): string {
        if (showTimestamp) {
            const endTime = new Date(activity.period);
            endTime.setSeconds(endTime.getSeconds() + activity.activityDurationSeconds);

            const year = endTime.getFullYear();
            const month = String(endTime.getMonth() + 1).padStart(2, '0');
            const day = String(endTime.getDate()).padStart(2, '0');
            const timeString = endTime.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });

            return `${year}-${month}-${day}, ${timeString}`;
        } else {
            let millis =
                Number(new Date()) -
                Number(new Date(activity.period)) -
                activity.activityDurationSeconds * 1000;

            let minutes = Math.floor(millis / 60000);

            if (minutes == 0) {
                return "1m ago";
            } else if (minutes < 60) {
                return `${minutes}m ago`;
            } else {
                return `${Math.floor(minutes / 60)}h ago`;
            }
        }
    }
</script>

<div class="raid">
    <div class="details">
        <p class="title">
            {#key `${activity.instanceId}-${completedStatus}`}
                <Dot completed={completedStatus} />
            {/key}
            <span>{displayName}</span>
        </p>
        <p>
            {activity.activityDuration}
            {#if differenceText}
                <span class="difference {difference > 0 ? 'incomplete' : 'Minus'}">{differenceText}</span>
            {/if}
            <span class="center-dot" />
            {displayText}
        </p>
    </div>
    <div class="report-container">
        <a
            href={reportUrl}
            target="_blank"
            rel="noreferrer"
            class="report-link"
        >
            <svg xmlns="http://www.w3.org/2000/svg" height="20" width="20"
                ><path
                    d="M4.5 17q-.625 0-1.062-.438Q3 16.125 3 15.5v-11q0-.625.438-1.062Q3.875 3 4.5 3H10v1.5H4.5v11h11V10H17v5.5q0 .625-.438 1.062Q16.125 17 15.5 17Zm3.562-4L7 11.938 14.438 4.5H12V3h5v5h-1.5V5.562Z"
                /></svg
            >
        </a>
        {#if activity.characterClass}
            <span class="class-icons">
                {#each activity.characterClass.split(',') as className}
                    <span class="class-icon">
                        {#if className === 'Hunter'}
                            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="m9.055 10.446 6.945-.023-6.948 10.451 6.948-.024-7.412 11.15h-7.045l7.036-10.428h-7.036l7.032-10.422h-7.032l7.507-11.126 6.95-.024zm13.89 0-6.945-10.446 6.95.024 7.507 11.126h-7.032l7.032 10.422h-7.036l7.036 10.428h-7.045l-7.412-11.15 6.948.024-6.948-10.451z"/></svg>
                        {:else if className === 'Warlock'}
                            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="m5.442 23.986 7.255-11.65-2.71-4.322-9.987 15.972zm5.986 0 4.28-6.849-2.717-4.333-6.992 11.182zm7.83-11.611 7.316 11.611h5.426l-10.015-15.972zm-7.26 11.611h8.004l-4.008-6.392zm6.991-11.182-2.703 4.324 4.302 6.858h5.413zm-5.707-.459 2.71-4.331 2.71 4.331-2.703 4.326z"/></svg>
                        {:else if className === 'Titan'}
                            <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="m14.839 15.979-13.178-7.609v15.218zm2.322 0 13.178 7.609v-15.218zm5.485-12.175-6.589-3.804-13.178 7.609 13.178 7.609 13.179-7.609zm0 16.784-6.589-3.805-13.178 7.609 13.178 7.608 13.179-7.608-6.59-3.805z"/></svg>
                        {/if}
                    </span>
                {/each}
            </span>
        {/if}
    </div>
</div>

<style>
    .raid {
        background-position: center;
        z-index: 1;
        padding: 8px 0;
        display: block;
        color: #fff;
        overflow: visible;
        font-size: 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .raid > div {
        display: inline-block;
    }

    .details {
        padding: 8px 16px;
        font-size: 14px;
        font-weight: 300;
        color: #ccc;
    }

    .title {
        font-size: 16px;
        margin-bottom: 12px;
        font-weight: 400;
        color: #fff;
    }

    .title span {
        vertical-align: middle;
    }

    .report-container {
        display: flex !important;
        flex-direction: column;
        float: right;
        width: 86px;
    }

    .raid::after {
        content: '';
        display: table;
        clear: both;
    }

    .report-container a {
        display: block;
        margin-bottom: 12px;
        align-self: flex-end;
        margin-right: 20px;
    }

    .class-icons {
        display: flex;
        flex-direction: row-reverse;
        justify-content: flex-start;
        gap: 4px;
        padding-right: 26px;
    }

    .class-icon {
        display: inline-block;
    }

    .class-icon svg {
        width: 16px;
        height: 16px;
        fill: #ccc;
    }

    .center-dot {
        display: inline-block;
        vertical-align: middle;
        width: 3px;
        height: 3px;
        background-color: #ccc;
        border-radius: 50%;
        margin: 0 8px;
    }

    .difference {
        display: inline-block;
        vertical-align: middle;
        margin: 0 2px;
        font-size: 14px;
        font-weight: 300;
        padding: 1px 3px;
        position: relative;
        top: -1px;
        text-align: center;
    }

    .difference.incomplete {
        color: rgba(from var(--difference-incomplete-color) r g b / 0.8);
        background-color: rgba(from var(--difference-incomplete-color) r g b / 0.1);
    }

    .difference.Minus {
        color: rgba(from var(--difference-completed-color) r g b / 0.8);
        background-color: rgba(from var(--difference-completed-color) r g b / 0.1);
    }

    a {
        float: right;
        padding: 4px;
        font-size: 0;
        fill: #aaa;
        transition: background-color 0.1s, fill 0.1s;
    }

    a:hover {
        background-color: rgba(255, 255, 255, 0.08);
        fill: #fff;
    }
</style>
