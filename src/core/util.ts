import { ACTIVITY_TYPES, KNOWN_RAIDS, KNOWN_DUNGEONS } from "./consts";
import type { CompletedActivity } from "./types";

export function formatTime(millis: number): string {
    let seconds = Math.floor(millis / 1000);

    let minutes = Math.floor(seconds / 60);
    seconds = seconds - (minutes * 60);

    let hours = Math.floor(minutes / 60);
    minutes = minutes - (hours * 60);

    return (hours > 0 ? (hours + ":") : "") + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
}

export function formatMillis(millis: number): string {
    return ":" + String(millis % 1000).padStart(3, "0").substring(0, 2);
}

export function countClears(activityHistory: CompletedActivity[]): number {
    let clearCount = 0;
    for (let activity of activityHistory) {
        if (activity.completed) {
            clearCount++;
        }
    }

    return clearCount;
}

export function determineActivityType(modes: number[]): string | undefined {
    if (!modes) {
        return;
    }

    for (const mode of modes) {
        if (ACTIVITY_TYPES[mode]) {
            return ACTIVITY_TYPES[mode];
        }
    }
}

export function calculateAverageClearTime(activities: CompletedActivity[]): number {
    const completedActivities = activities.filter(a => a.completed);
    if (completedActivities.length === 0) return 0;

    const totalTime = completedActivities.reduce((sum, activity) =>
        sum + activity.activityDurationSeconds, 0);
    return totalTime / completedActivities.length;
}

export function formatTimeWithUnit(seconds: number): string {
    let hours = Math.floor(seconds / 3600);
    let minutes = Math.floor((seconds % 3600) / 60);
    let secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

export function resolveActivityName(activityHash: number, fallbackName: string): string {
    if (Object.prototype.hasOwnProperty.call(KNOWN_RAIDS, activityHash)) {
        return KNOWN_RAIDS[activityHash as keyof typeof KNOWN_RAIDS];
    }

    if (Object.prototype.hasOwnProperty.call(KNOWN_DUNGEONS, activityHash)) {
        return KNOWN_DUNGEONS[activityHash as keyof typeof KNOWN_DUNGEONS];
    }

    return fallbackName;
}
