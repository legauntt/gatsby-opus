<script lang="ts">
	import { Toaster } from 'svelte-5-french-toast';
	import Jukebawx from '$lib/comps/jukebawx.svelte';
	import { jukebawx } from '$lib/player.svelte';
	import '../app.css';

	let { children } = $props();
</script>

<Toaster />

<!-- Leave room for da jukebawx so it never sits on top of the content -->
<div class={jukebawx.track ? 'pb-28' : ''}>
	{@render children()}
</div>

<Jukebawx />
