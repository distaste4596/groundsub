<script lang="ts">
    import { determineActivityType } from "../../core/util";
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
    
    let displayText = '';
    let displayName = '';
    let lastActivityHash: number | undefined;
    let isLoading = false;
    
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
                return `https://gm.report/pgcr/${activity.instanceId}`;
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
            <Dot completed={activity.completed} />
            <span>{displayName}</span>
        </p>
        <p>
            {activity.activityDuration}
            <span class="center-dot" />
            {displayText}
        </p>
    </div>
    <a
        href={reportUrl}
        target="_blank"
        rel="noreferrer"
        ><svg xmlns="http://www.w3.org/2000/svg" height="20" width="20"
            ><path
                d="M4.5 17q-.625 0-1.062-.438Q3 16.125 3 15.5v-11q0-.625.438-1.062Q3.875 3 4.5 3H10v1.5H4.5v11h11V10H17v5.5q0 .625-.438 1.062Q16.125 17 15.5 17Zm3.562-4L7 11.938 14.438 4.5H12V3h5v5h-1.5V5.562Z"
            /></svg
        ></a
    >
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

    .center-dot {
        display: inline-block;
        vertical-align: middle;
        width: 3px;
        height: 3px;
        background-color: #ccc;
        border-radius: 50%;
        margin: 0 8px;
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
