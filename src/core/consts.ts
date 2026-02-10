export const BUNGIE_BASE_PATH = "https://bungie.net";
export const REPOSITORY_LINK = "https://github.com/distaste4596/groundsub";
export const REPOSITORY_LINK_ISSUES = "https://github.com/distaste4596/groundsub/issues/new";
export const BUNGIE_API_STATUS = "https://help.bungie.net/hc/en-us/articles/360049199271-Destiny-Server-and-Update-Status"

export const ACTIVITY_TYPES: Record<number, string> = {
    2: "Story",
    4: "Raid",
    82: "Dungeon",
    18: "Strike",
    87: "Lost Sector"
}

export const KNOWN_RAIDS = {
    2122313384: "Last Wish",
    1042180643: "Garden of Salvation",
    910380154: "Deep Stone Crypt",
    3881495763: "Vault of Glass",
    3022541210: "Vault of Glass (Master)",
    1441982566: "Vow of the Disciple",
    3889634515: "Vow of the Disciple (Master)",
    1374392663: "King's Fall",
    3257594522: "King's Fall (Master)",
    2381413764: "Root of Nightmares",
    2918919505: "Root of Nightmares (Master)",
    107319834: "Crota's End",
    1507509200: "Crota's End (Master)",
    1541433876: "Salvation's Edge",
    4129614942: "Salvation's Edge (Master)",
    1044919065: "The Desert Perpetual",
    3817322389: "The Desert Perpetual (Epic)",
};

export const KNOWN_DUNGEONS = {
    2032534090: "The Shattered Throne",
    2582501063: "Pit of Heresy",
    1077850348: "Prophecy",
    4078656646: "Grasp of Avarice",
    1112917203: "Grasp of Avarice (Master)",
    2823159265: "Duality",
    3012587626: "Duality (Master)",
    1262462921: "Spire of the Watcher",
    2296818662: "Spire of the Watcher (Master)",
    313828469: "Ghosts of the Deep",
    2716998124: "Ghosts of the Deep (Master)",
    2004855007: "Warlord's Ruin",
    2534833093: "Warlord's Ruin (Master)",
    300092127: "Vesper's Host",
    4293676253: "Vesper's Host (Master)",
    3834447244: "The Sundered Doctrine",
    3521648250: "The Sundered Doctrine (Master)",
    2727361621: "Equilibrium",
};

export const ACTIVITY_ALIASES = {
    "lw": "last-wish",
    "gos": "garden-of-salvation",
    "dsc": "deep-stone-crypt",
    "vog": "vault-of-glass",
    "kf": "kings-fall",
    "ron": "root-of-nightmares",
    "se": "salvations-edge",
    "dp": "the-desert-perpetual",

    "gotd": "ghosts-of-the-deep",
    "wr": "warlord-s-ruin",
    "vh": "vesper-s-host",
    "sd": "the-sundered-doctrine",
};

function generateGroupedActivities(activities: Record<number, string>) {
    const groups: Record<string, { name: string; hashes: number[] }> = {};
    
    Object.entries(activities).forEach(([hash, name]) => {
        const baseName = name.replace(/\s*\([^)]*\)$/, '');
        const key = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        
        if (!groups[key]) {
            groups[key] = { name: baseName, hashes: [] };
        }
        groups[key].hashes.push(parseInt(hash));
    });
    
    return groups;
}

export const GROUPED_RAIDS = generateGroupedActivities(KNOWN_RAIDS);
export const GROUPED_DUNGEONS = generateGroupedActivities(KNOWN_DUNGEONS);

export const EXCLUDED_ACTIVITIES: number[] = [
    3830679567, // Shooting Range
];
