import type { CurrentActivity } from "./types";
import { formatTime, formatMillis, determineActivityType } from "./util";

export interface TimerConfig {
    displayMilliseconds: boolean;
    updateRate?: number;
    mode?: 'default' | 'persistent';
}

export interface TimerState {
    timeText: string;
    msText: string;
    isActive: boolean;
    mode: 'default' | 'persistent';
}

export class Timer {
    private intervalId: number | undefined;
    private startTime: number | undefined;
    private endTime: number | undefined;
    private state: TimerState;
    private config: TimerConfig;
    private callbacks: ((state: TimerState) => void)[] = [];
    private lastActivity: CurrentActivity | undefined;
    private lastCompletionCount: number = 0;
    private lastCompletedActivityHash: number | undefined;
    private knownCompletions: Set<string> = new Set();

    constructor(config: TimerConfig) {
        this.config = {
            updateRate: config.displayMilliseconds ? 16 : 2,
            mode: 'default',
            ...config
        };
        
        this.state = {
            timeText: "",
            msText: "",
            isActive: false,
            mode: this.config.mode || 'default'
        };
    }

    public subscribe(callback: (state: TimerState) => void): () => void {
        this.callbacks.push(callback);
        
        callback(this.state);
        
        return () => {
            const index = this.callbacks.indexOf(callback);
            if (index > -1) {
                this.callbacks.splice(index, 1);
            }
        };
    }

    public startActivity(activity: CurrentActivity, activityHistory: any[]): void {
        if (!activity?.startDate) {
            this.stop();
            return;
        }

        if (this.config.mode === 'persistent' && activityHistory.length > 0) {
            const lastActivityInHistory = activityHistory[0];
            const lastActivityEndTime = lastActivityInHistory.period ? 
                Number(new Date(new Date(lastActivityInHistory.period).setSeconds(
                    new Date(lastActivityInHistory.period).getSeconds() + lastActivityInHistory.activityDurationSeconds
                ))) : undefined;

            if (lastActivityEndTime) {
                const newActivityStartTime = Number(new Date(activity.startDate));
                const bufferTime = 40000;


                if (newActivityStartTime <= (lastActivityEndTime - bufferTime)) {
                    return;
                }

            }
        }

        if (this.config.mode === 'persistent' && this.lastActivity && !this.endTime) {
            if (this.lastActivity.activityHash === activity.activityHash) {
                return;
            }
        }

        if (this.config.mode === 'persistent' && this.lastActivity === undefined && this.endTime) {
            return;
        }


        this.lastActivity = activity;
        this.startTime = Number(new Date(activity.startDate));
        this.endTime = undefined;
        this.state.isActive = true;

        this.startInterval();
        this.updateState();
    }

    public checkActivityCompleted(activityHistory: any[]): void {
        if (this.config.mode !== 'persistent' || !this.lastActivity || !activityHistory.length) {
            return;
        }

        const mostRecentActivity = activityHistory[0];
        const completionKey = `${mostRecentActivity.activityHash}_${mostRecentActivity.period}`;

        if (this.knownCompletions.has(completionKey)) {
            return;
        }


        this.knownCompletions.add(completionKey);

        if (mostRecentActivity.activityHash === this.lastActivity?.activityHash) {
            this.endTime = Number(new Date());
            this.state.isActive = false;
            this.notifyCallbacks();

            this.lastActivity = undefined;

            setTimeout(() => {
                this.endTime = undefined;
                this.lastCompletedActivityHash = undefined;
            }, 3000);
        }
    }

    public setMode(mode: 'default' | 'persistent'): void {
        this.config.mode = mode;
        this.state.mode = mode;

        this.notifyCallbacks();
    }

    public getMode(): 'default' | 'persistent' {
        return this.config.mode || 'default';
    }

    public stop(): void {

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        if (this.config.mode === 'persistent') {
            if (this.endTime) {
                this.state.isActive = false;
                this.state.timeText = "";
                this.state.msText = "";
                this.startTime = undefined;
                this.lastActivity = undefined;
            }
            return;
        } else {
            this.state.isActive = false;
            this.state.timeText = "";
            this.state.msText = "";
            this.startTime = undefined;
            this.lastActivity = undefined;
            this.endTime = undefined;
        }
        
        this.notifyCallbacks();
    }

    public updateConfig(config: Partial<TimerConfig>): void {
        const oldDisplayMs = this.config.displayMilliseconds;
        this.config = { ...this.config, ...config };

        if (config.displayMilliseconds !== undefined || config.updateRate !== undefined) {
            this.config.updateRate = this.config.displayMilliseconds ? 30 : 2;
        }

        if (this.state.isActive && this.intervalId) {
            if (oldDisplayMs !== this.config.displayMilliseconds) {
                this.startInterval();
            }
        }
    }

    public getState(): TimerState {
        return { ...this.state };
    }

    public resetCompletionTracking(): void {
        this.lastCompletionCount = 0;
    }

    public wasRecentlyCompleted(activityHash: number): boolean {
        return this.lastCompletedActivityHash === activityHash;
    }
    public isTrackingActivity(activityHash: number): boolean {
        const result = this.lastActivity?.activityHash === activityHash && 
                      this.state.isActive && 
                      !this.endTime;
        return result;
    }

    public restartActivity(activity: CurrentActivity): void {
        if (!activity?.startDate) {
            return;
        }

        this.lastActivity = activity;
        this.startTime = Number(new Date(activity.startDate));
        this.endTime = undefined;
        this.state.isActive = true;

        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        this.startInterval();
        this.updateState();
    }

    public clearActivity(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }

        this.state.isActive = false;
        this.state.timeText = "--:--:--";
        this.state.msText = "";
        this.startTime = undefined;
        this.lastActivity = undefined;
        this.endTime = undefined;
        this.notifyCallbacks();
    }

    public isRunning(): boolean {
        return this.state.isActive && this.intervalId !== undefined;
    }

    private startInterval(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
        
        this.intervalId = setInterval(() => {
            requestAnimationFrame(() => this.updateState());
        }, 1000 / (this.config.updateRate || 30));
    }

    private updateState(): void {
        if (!this.startTime) {
            return;
        }

        const millis = Number(new Date()) - this.startTime;
        
        this.state.timeText = formatTime(millis);
        this.state.msText = formatMillis(millis);
        
        this.notifyCallbacks();
    }

    private notifyCallbacks(): void {
        for (const callback of this.callbacks) {
            callback(this.state);
        }
    }
}

export function createTimer(config: TimerConfig): Timer {
    return new Timer(config);
}

export function shouldHaveTimer(activity: CurrentActivity | undefined): boolean {
    if (!activity?.activityInfo?.activityModes) {
        return false;
    }
    
    return !!determineActivityType(activity.activityInfo.activityModes);
}
