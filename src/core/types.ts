export type TauriEvent<T> = {
    payload: T
};

export type BungieProfile = {
    membershipType: number;
    membershipId: string;
    bungieGlobalDisplayName: string;
    bungieGlobalDisplayNameCode: number;
    crossSaveOverride: number;
};

export type Profiles = {
    savedProfiles: Profile[],
    selectedProfile: Profile,
}

export type Profile = {
    accountPlatform: number;
    accountId: string;
};

export type ProfileInfo = {
    privacy: number;
    displayName: string;
    displayTag: number;
    characterIds: string[];
};

export type Preferences = {
    enableOverlay: boolean;
    displayTimer: boolean;
    displayDailyClears: boolean;
    displayAverageClearTimeOverlay: boolean;
    displayIcons: boolean;
    displayClearNotifications: boolean;
    displayMilliseconds: boolean;
    showTimestampInstead: boolean;
    useRealTime: boolean;
    displayAverageClearTimeDetails: boolean;
    displayDifferenceIndicator: boolean;
    primaryBackground: string;
    secondaryBackground: string;
    primaryHighlight: string;
    infoTextColor: string;
    incompleteColor: string;
    completedColor: string;
    filterActivityType: string;
    filterTimespan: string;
    timerMode: 'default' | 'persistent';
    raidLinkProvider: 'raid.report' | 'raidhub.io';
    overlayPosition: 'left' | 'right' | 'bottom-left' | 'bottom-right';
    customOverlayX: number;
    customOverlayY: number;
    overlaySize: 'small' | 'medium' | 'large';
    overlayLayout: 'horizontal' | 'vertical';
    customStartDate: string;
    displayNowPlaying: boolean;
    overlayBackgroundOpacity: number;
};

export type PlayerDataStatus = {
    lastUpdate: PlayerData | null,
    error: string | null,
    historyLoading: boolean,
}

export type PlayerData = {
    currentActivity: CurrentActivity;
    activityHistory: CompletedActivity[];
    profileInfo: ProfileInfo;
};

export type CurrentActivity = {
    startDate: string;
    activityHash: number;
    activityInfo: ActivityInfo;
};

export type ActivityInfo = {
    name: string;
    activityModes: number[];
    backgroundImage: string;
};

export type CompletedActivity = {
    period: string;
    instanceId: string;
    completed: boolean;
    activityDuration: string;
    activityDurationSeconds: number;
    activityHash: number;
    modes: number[];
    characterClass?: string;
};

export interface TimerState {
    timeText: string;
    msText: string;
    isActive: boolean;
    mode: 'default' | 'persistent';
}

export type MediaInfo = {
    title: string;
    artist: string;
    album: string;
    albumArtist: string;
    trackNumber: number;
    isPlaying: boolean;
    appId: string;
    hasMedia: boolean;
};
