<script lang="ts">
    export let checked = false;
    export let disabled = false;
    export let title = '';
    
    $: showTooltip = title && title.length > 0;
</script>

<button
    class="container {checked ? 'checked' : ''}"
    on:click={() => (checked = !checked)}
    {disabled}
    {title}
>
    <div class="box">
        <div class="checkmark" />
    </div>
    <span><slot /></span>
    {#if showTooltip}
        <svg class="tooltip-icon" xmlns="http://www.w3.org/2000/svg" height="12" width="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
    {/if}
</button>

<style>
    .container {
        display: flex;
        align-items: flex-start;
        min-height: 20px;
        height: auto;
    }

    .box {
        position: relative;
        display: inline-block;
        width: 16px;
        height: 16px;
        margin-right: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background-color: rgba(0, 0, 0, 0.1);
        border-radius: 2px;
        transition: background-color 0.1s;
        flex-shrink: 0;
        margin-top: 2px;
    }

    .container:not(.checked):not(:disabled) .box:hover {
        background-color: rgba(255, 255, 255, 0.05);
    }

    .container.checked .box {
        background-color: var(--primary-highlight);
    }

    .container:disabled .box {
        background-color: rgba(40, 40, 40, 0.4);
    }
    
    .tooltip-icon {
        opacity: 0.4;
        margin-left: 6px;
        flex-shrink: 0;
        transition: opacity 0.2s;
        color: rgba(255, 255, 255, 0.6);
    }
    
    .container:not(:disabled):hover .tooltip-icon {
        opacity: 0.7;
        color: rgba(255, 255, 255, 0.8);
    }

    .container.checked:disabled .box {
        background-color: rgba(100, 100, 100, 0.4);
    }

    .checkmark {
        position: absolute;
        opacity: 0;
        left: 6px;
        top: 2px;
        width: 3px;
        height: 8px;
        border: solid #fff;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
        pointer-events: none;
        transition: opacity 0.1s;
    }

    .container.checked .checkmark {
        opacity: 1;
    }

    .container.checked:disabled .checkmark {
        opacity: 0.4;
    }

    span {
        display: inline-block;
        font-size: 14px;
        line-height: 1.4;
        color: #fff;
        white-space: normal;
        flex: 1;
    }

    .container:disabled span {
        color: #777;
    }
</style>
