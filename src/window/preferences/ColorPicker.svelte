<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let label: string;
    export let value: string;
    
    const dispatch = createEventDispatcher<{ change: string }>();
    
    function handleInput(e: Event) {
        const target = e.target as HTMLInputElement;
        value = target.value;
        dispatch('change', value);
    }
</script>

<div class="color-picker">
    <label>
        <span>{label}</span>
        <div class="color-preview" style="background-color: {value}">
            <input
                type="color"
                value={value}
                on:input={handleInput}
                aria-label={label}
            />
        </div>
    </label>
</div>

<style>
    .color-picker {
        margin: 2px 0;
        width: 100%;
    }
    
    .color-picker label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-family: 'Inter Tight', sans-serif;
        font-size: 14px;
        font-weight: 400;
        line-height: 20px;
        color: #fff;
        padding: 3px 0;
        width: 100%;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    .color-preview {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 24px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        transition: all 0.2s ease;
        cursor: pointer;
        overflow: hidden;
        margin-left: 6px;
        vertical-align: middle;
    }

    .color-preview input[type="color"] {
        opacity: 0;
        width: 100%;
        height: 100%;
        cursor: pointer;
    }

    label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
    }

    span {
        flex-grow: 1;
    }
</style>
