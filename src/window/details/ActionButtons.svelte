<script lang="ts">
    import { openPreferences, openProfiles } from "../../core/ipc";

    export let showTimerButtons: boolean = true;
    export let timerMode: 'default' | 'persistent' = 'default';
    export let refreshPersistentTimer: () => void;
    export let toggleTimerMode: () => void;
</script>

<div class="actions">
    {#if showTimerButtons}
        {#if timerMode === 'persistent'}
            <button on:click={refreshPersistentTimer} class="refresh-timer-btn" title="Resets the timer to current activity">
                <svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4z"/></svg>
            </button>
        {/if}
        <button on:click={toggleTimerMode} class="timer-mode-btn">
            {timerMode === 'persistent' ? 'Persistent Timer' : 'Default Timer'}
        </button>
    {/if}
    <button on:click={() => openProfiles()}>
        <svg
            xmlns="http://www.w3.org/2000/svg"
            height="24"
            width="24"
        ><path
                d="M12 12q-1.65 0-2.825-1.175Q8 9.65 8 8q0-1.65 1.175-2.825Q10.35 4 12 4q1.65 0 2.825 1.175Q16 6.35 16 8q0 1.65-1.175 2.825Q13.65 12 12 12Zm-8 8v-2.8q0-.85.438-1.563.437-.712 1.162-1.087 1.55-.775 3.15-1.163Q10.35 13 12 13t3.25.387q1.6.388 3.15 1.163.725.375 1.162 1.087Q20 16.35 20 17.2V20Z"
            /></svg
        >
    </button>
    <button on:click={() => openPreferences()}>
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

<style>
    .actions {
        display: flex;
        gap: 3px;
        align-items: flex-start;
        margin-top: 0px;
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
</style>
