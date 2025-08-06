import {Plugin, SettingsTypes} from "@highlite/plugin-api";

export default class PlayerTagger extends Plugin {
    pluginName: string = 'Player Tagger';
    author = '0rangeYouGlad';

    private injectedEls = new Set<HTMLElement>();
    private isInitialized = false;
    private messageWatchersSetup = false;
    private nameplateWatchersSetup = false;

    private processedMessages = new Set<HTMLElement>();
    
    private observers: MutationObserver[] = [];

    private defaultTagStyle = 'background:rgba(0.1,0.1,0.1,0.6) ; border-radius:2px; border:2px solid rgba(0, 0, 0, 1); text-align: center;padding:2px 2px;margin-right:2px;color:white;font-weight: 300; line-height: 2; font-size: x-small;';

    getTagStyle(tag: string) {
        var tags = this.settings.tagStyles.value?.split("+");
        var cssForTag = tags.find((tagName) => tagName && tagName.trim() && tagName.split("=")[0].toLowerCase().trim() === tag.toLowerCase().trim())?.split("=")[1];

        return cssForTag || this.defaultTagStyle;
    }

    getTagsForPlayer(playerName: string) {
        var players = this.settings.playerTags.value?.split(';');
        var tagsForPlayer = players.find((pName) => pName.split(":")[0].toLowerCase().trim() === playerName.toLowerCase().trim())?.split(":")[1]?.split(',');
        
        return tagsForPlayer || [];
    }
    
    getTagSpan(playerName: string) {
        const outerSpan = document.createElement('span');

        var tags = this.getTagsForPlayer(playerName);
        tags.forEach((tag) => {
            const span = document.createElement('span');
            span.innerHTML = tag.trim();
            span.style.cssText = this.getTagStyle(tag.trim());
            outerSpan.appendChild(span);
        })

        return outerSpan;
    }

    private trackInjected(el: HTMLElement): void {
        this.injectedEls.add(el);
    }

    constructor() {
        super();

        // TODO use actual JSON for this?
        this.settings.playerTags = {
            text: 'Player Tags (username:tag1,tag2;username2:tag1,tag2;)',
            type: SettingsTypes.text,
            value: 'ExampleUsername:CLAN⚔️,Example Tag',
            callback: () => {
                this.cleanupProcessedElements();
                if(this.settings.tagChat.value) this.scanAllMessages();
                if(this.settings.tagNameplates.value) this.scanAllNameplates();
            },
        };   

        this.settings.tagStyles = {
            text: 'Tag styles (+tag=css +tag2=css)',
            type: SettingsTypes.text,
            value: '+CLAN⚔️=font-weight:300;background:rgba(230,230,250,200);border:2px solid rgba(75,0,130,255);border-radius:2px;text-align: center;padding:2px 2px;margin-right:2px;color:rgba(75,0,130,255);font-size: x-small; line-height:2;',
            callback: () => {
                this.cleanupProcessedElements();
                this.processedMessages.clear();
                if(this.settings.tagChat.value) this.scanAllMessages();
                if(this.settings.tagNameplates.value) this.scanAllNameplates();
            },
        };

        this.settings.tagChat = {
            text: 'Chat Tags',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {
                this.cleanupProcessedElements();
                if(this.settings.tagChat.value) this.scanAllMessages();
                if(this.settings.tagNameplates.value) this.scanAllNameplates();
            },
        };

        this.settings.tagNameplates = {
            text: 'Nameplate Tags',
            type: SettingsTypes.checkbox,
            value: true,
            callback: () => {
                this.cleanupProcessedElements();
                if(this.settings.tagChat.value) this.scanAllMessages();
                if(this.settings.tagNameplates.value) this.scanAllNameplates();
            },
        };
    }

    init(): void {
        this.log('Initialized PlayerTagger');
        if(this.settings.enable.value) {
            this.isInitialized = true;
            if(this.settings.tagChat.value) this.setupMessageWatching();
            if(this.settings.tagNameplates.value) this.setupNameplateWatching();
        }
    }

    start(): void {
        this.log('Started PlayerTagger');
    }

    stop(): void {
        this.log('Stopped PlayerTagger');
        this.cleanup();
        this.isInitialized = false;
    }

    private cleanup(): void {
        this.log('Cleaning up PlayerTagger...');

                
        this.observers.forEach(observer => observer.disconnect());
        this.observers = [];

        this.injectedEls.forEach(el => {
            if (el.parentNode) {
                el.parentNode.removeChild(el);
            }
        });
        this.injectedEls.clear();

        if (this.messageCheckInterval) {
            window.clearInterval(this.messageCheckInterval);
            this.messageCheckInterval = null;
        }
        
        if (this.nameplateCheckInterval) {
            window.clearInterval(this.nameplateCheckInterval);
            this.nameplateCheckInterval = null;
        }

        this.processedMessages.clear();

        this.isInitialized = false;
        this.messageWatchersSetup = false;
        this.nameplateWatchersSetup = false;
        this.log('PlayerTagger cleanup complete');
    }

    private setupNameplateWatching(): void {
        if (this.nameplateWatchersSetup) return;
        this.nameplateWatchersSetup = true;

        this.scanAllNameplates();

        this.nameplateCheckInterval = window.setInterval(() => {
            this.scanAllNameplates();
        }, 500);
    }

    private trackObserver(
        fn: MutationCallback,
        target: Node,
        opts: MutationObserverInit
    ): MutationObserver {
        const observer = new MutationObserver(fn);
        observer.observe(target, opts);
        this.observers.push(observer);
        return observer;
    }
    
    private setupMessageWatching(): void {
        if (this.messageWatchersSetup) return;
        this.messageWatchersSetup = true;

        this.scanAllMessages();

        const watchPairs = [
            ['#hs-public-message-list', '#hs-public-message-list__container'],
            ['#hs-private-message-list', '#hs-private-message-list'],
        ];

        watchPairs.forEach(([listSel, wrapSel]) => {
            const list = document.querySelector(listSel);
            const wrap = document.querySelector(wrapSel) as HTMLElement;
            if (list && wrap) {
                this.trackObserver(
                    records => {
                        records.forEach(record => {
                            if (record.addedNodes.length) {
                                setTimeout(() => this.scanAllMessages(), 10);
                            }
                        });
                    },
                    list,
                    { childList: true, subtree: true }
                );
            }
        });

        this.messageCheckInterval = window.setInterval(() => {
            this.scanAllMessages();
        }, 500);
    }

    private scanAllNameplates(): void {
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const containers = [
            document.querySelector('#highlite-nameplates'),
        ];

        containers.forEach(container => {
            if (container) {
                this.processNewNameplate(container as HTMLElement);
            }
        });
    }


    private processNewNameplate(container: HTMLElement): void {
        if (!container) return;
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const messages = container.querySelectorAll(
`[id^='highlite-nameplates-player']`        );
        let foundNewMessages = false;

        messages.forEach(msg => {
            const msgEl = msg as HTMLElement;

            if (this.processedMessages.has(msgEl)) return;

            foundNewMessages = true;
            this.processedMessages.add(msgEl);

            const playerName = `${msg.textContent}`.trim();

            const span = this.getTagSpan(playerName);

            msgEl.setAttribute('data-player-tag-injected', 'true');
            msgEl.prepend(span);
            this.trackInjected(span);
        });
    }

    private scanAllMessages(): void {
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const containers = [
            document.querySelector('#hs-public-message-list__container'),
            document.querySelector('#hs-private-message-list'),
        ];

        containers.forEach(container => {
            if (container) {
                this.processNewMessages(container as HTMLElement);
            }
        });
    }

    private processNewMessages(container: HTMLElement): void {
        if (!container) return;
        if (!this.settings.enable?.value || !this.isInitialized) return;

        const messages = container.querySelectorAll(
            '.hs-chat-message-container'
        );
        let foundNewMessages = false;

        messages.forEach(msg => {
            const msgEl = msg as HTMLElement;

            if (this.processedMessages.has(msgEl)) return;

            foundNewMessages = true;
            this.processedMessages.add(msgEl);

            let playerNameContainer = msgEl.querySelector(
                '.hs-chat-menu__player-name'
            );
            if(!playerNameContainer) {
                playerNameContainer = msgEl.querySelector('.hs-chat-menu__pre-text')
            }
            const playerName = `${playerNameContainer?.textContent}`.replace("From ", "").replace(":", "").trim();

            const span = this.getTagSpan(playerName);

            if (playerNameContainer) {
                msgEl.setAttribute('data-player-tag-injected', 'true');
                playerNameContainer.prepend(span);
                this.trackInjected(span);
            }
        });
    }

    private cleanupProcessedElements(): void {
        this.injectedEls.forEach(msgEl => {
            msgEl.remove();
            this.injectedEls.delete(msgEl);
        });
        this.injectedEls.clear();
        this.processedMessages.clear();
    }
}
