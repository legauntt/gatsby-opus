<script lang="ts">
	interface StoolProps {
		label: string;
		paused: boolean;
		currentTime: number;
		muted: boolean;
		volume: number;
		duration: number;
		onTogglePause: Function;
		onSeek: Function;
	}

	let props: StoolProps = $props();
</script>

<div>
	<input class="p-2 border border-solid border-slate-500" value={props.label} />
	<div>
		{#if props.paused}
			<button aria-label="Play" onclick={() => props.onTogglePause()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					stroke-width="1.5"
					stroke="currentColor"
					class="size-12"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
					/>
				</svg>
			</button>
		{:else}
			<button aria-label="Pause" onclick={() => props.onTogglePause()}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="currentColor"
					class="size-12"
				>
					<path
						fill-rule="evenodd"
						d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12ZM9 8.25a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75h.75a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75H9Zm5.25 0a.75.75 0 0 0-.75.75v6c0 .414.336.75.75.75H15a.75.75 0 0 0 .75-.75V9a.75.75 0 0 0-.75-.75h-.75Z"
						clip-rule="evenodd"
					/>
				</svg>
			</button>
		{/if}
	</div>
</div>

<style scoped></style>
