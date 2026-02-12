<script lang="ts">
    import { onMount, onDestroy } from 'svelte';

    export let value: string = '';
    export let options: { value: string; label: string }[] = [];
    export let getAllOptions: ((query: string) => { value: string; label: string }[]) | undefined = undefined;
    export let getAllActivityOptions: (() => { value: string; label: string }[]) | undefined = undefined;
    export let placeholder: string = 'Search...';
    export let searchable: boolean = true;
    export let width: string = '160px';
    let searchInput: HTMLInputElement;
    let isOpen: boolean = false;
    let searchQuery: string = '';
    let filteredOptions: { value: string; label: string }[] = [];
    let highlightedIndex: number = -1;
    let selectElement: HTMLDivElement;
    let dropdownPosition: { top: number; left: number } = { top: 0, left: 0 };

    $: filteredOptions = searchable && searchQuery.trim() !== '' 
        ? (getAllOptions ? getAllOptions(searchQuery) : options).slice(0, 5)
        : options;

    function toggleDropdown() {
        isOpen = !isOpen;
        if (isOpen) {
            if (searchable) {
                searchQuery = '';
                highlightedIndex = -1;
            }
            const rect = selectElement.getBoundingClientRect();
            dropdownPosition = {
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX
            };
            
            if (searchable) {
                requestAnimationFrame(() => {
                    if (searchInput) {
                        searchInput.focus();
                    }
                });
            }
        }
    }

    function selectOption(optionValue: string) {
        value = optionValue;
        isOpen = false;
        if (searchable) {
            searchQuery = '';
            highlightedIndex = -1;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (!isOpen) return;

        if (!searchable) {
            switch (e.key) {
                case 'Enter':
                case ' ':
                    e.preventDefault();
                    if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                        selectOption(filteredOptions[highlightedIndex].value);
                    }
                    break;
                case 'Escape':
                    isOpen = false;
                    break;
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                highlightedIndex = Math.min(highlightedIndex + 1, filteredOptions.length - 1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                highlightedIndex = Math.max(highlightedIndex - 1, -1);
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
                    selectOption(filteredOptions[highlightedIndex].value);
                }
                break;
            case 'Escape':
                isOpen = false;
                break;
        }
    }

    function handleClickOutside(e: MouseEvent) {
        if (selectElement && !selectElement.contains(e.target as Node)) {
            isOpen = false;
        }
    }

    function handleScroll() {
        if (isOpen) {
            isOpen = false;
        }
    }

    onMount(() => {
        document.addEventListener('click', handleClickOutside);
        const contentElement = document.getElementById('content');
        if (contentElement) {
            contentElement.addEventListener('scroll', handleScroll);
        }
    });

    onDestroy(() => {
        document.removeEventListener('click', handleClickOutside);
        const contentElement = document.getElementById('content');
        if (contentElement) {
            contentElement.removeEventListener('scroll', handleScroll);
        }
    });

    $: displayLabel = (() => {
        let label = options.find(opt => opt.value === value)?.label;
        
        if (!label && getAllActivityOptions) {
            try {
                const allActivityOpts = getAllActivityOptions();
                label = allActivityOpts.find(opt => opt.value === value)?.label;
            } catch (e) {
            }
        }
        
        if (!label) {
            label = placeholder;
        }
        return label;
    })();
</script>

<div class="searchable-select" style="width: {width};" bind:this={selectElement} on:keydown={handleKeydown} role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-controls="options-list" tabindex="0">
    <div class="select-trigger" on:click={toggleDropdown} on:keydown={(e) => e.key === 'Enter' && toggleDropdown()} class:open={isOpen} role="button" tabindex="0" aria-label="Select activity type">
        <span class="selected-value">{displayLabel}</span>
    </div>
    
    {#if isOpen}
        <div class="dropdown-menu" style="top: {dropdownPosition.top}px; left: {dropdownPosition.left}px; width: {width};">
            {#if searchable}
                <input 
                    type="text" 
                    class="search-input" 
                    bind:value={searchQuery} 
                    bind:this={searchInput}
                    placeholder={placeholder}
                    on:click|stopPropagation
                    on:focus={() => searchQuery = ''}
                />
            {/if}
            <div class="options-list" role="listbox" id="options-list">
                {#each filteredOptions as option, index}
                    <div 
                        class="option" 
                        class:highlighted={searchable && index === highlightedIndex}
                        class:selected={value === option.value}
                        on:click={() => selectOption(option.value)}
                        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOption(option.value); } }}
                        on:mouseenter={() => searchable && (highlightedIndex = index)}
                        role="option"
                        tabindex="-1"
                        aria-selected={value === option.value}
                    >
                        {option.label}
                    </div>
                {/each}
                {#if filteredOptions.length === 0 && searchable}
                    <div class="no-results">No activities found</div>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style>
    .searchable-select {
        position: relative;
        z-index: 1;
        overflow: visible !important;
    }

    .searchable-select *,
    .searchable-select *::before,
    .searchable-select *::after {
        overflow: visible !important;
    }

    .select-trigger {
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
        width: 100%;
        cursor: pointer;
        transition: all 0.1s ease;
        font-family: inherit;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
        height: 32px;
        display: flex;
        align-items: center;
        box-sizing: border-box;
    }

    .select-trigger:hover {
        background: rgba(255, 255, 255, 0.08);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .select-trigger.open {
        border-color: rgba(255, 255, 255, 0.3);
    }

    .selected-value {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .dropdown-menu {
        position: fixed;
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 0;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
        z-index: 9999;
        overflow: visible !important;
        box-sizing: border-box;
    }

    .search-input {
        width: 100%;
        padding: 6px 6px;
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        background: rgba(255, 255, 255, 0.035);
        backdrop-filter: blur(8px);
        color: var(--text-primary);
        font-size: 13px;
        font-family: inherit;
        outline: none;
        box-sizing: border-box;
    }

    .search-input::placeholder {
        color: var(--text-secondary);
    }

    .options-list {
        max-height: 200px;
        overflow-y: auto;
    }

    .option {
        padding: 8px 12px;
        cursor: pointer;
        transition: background-color 0.05s ease;
        font-size: 13px;
    }

    .option:hover,
    .option.highlighted {
        background-color: rgba(255, 255, 255, 0.08);
    }

    .no-results {
        padding: 12px;
        color: var(--text-secondary);
        font-size: 13px;
        text-align: center;
        font-style: italic;
    }

    .options-list::-webkit-scrollbar {
        width: 6px;
    }

    .options-list::-webkit-scrollbar-track {
        background: rgba(255, 255, 255, 0.05);
    }

    .options-list::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 3px;
    }

    .options-list::-webkit-scrollbar-thumb:hover {
        background: rgba(255, 255, 255, 0.3);
    }
</style>
