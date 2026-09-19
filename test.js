import process from 'node:process';
import childProcess from 'node:child_process';
import test from 'ava';
import {execa} from 'execa';
import delay from 'delay';
import noopProcess from 'noop-process';
import {processExists} from 'process-exists';
import getPort from 'get-port';
import groupByName from './group-by-name.js';
import {createChooserChoices, shouldGroupSearchResults} from './interactive.js';

const noopProcessKilled = async (t, pid) => {
	// Ensure the noop process has time to exit
	await delay(100);
	t.false(await processExists(pid));
};

test('main', async t => {
	const {stdout} = await execa('./cli.js', ['--version']);
	t.true(stdout.length > 0);
});

test('pid', async t => {
	const pid = await noopProcess();
	await execa('./cli.js', ['--force', pid]);
	await noopProcessKilled(t, pid);
});

// TODO: Upgrading AVA to latest caused this to not finish. Unclear why.
// test('fuzzy search', async t => {
// 	const pid = await noopProcess({title: '!noo00oop@'});
// 	await execa('./cli.js', ['o00oop@']);
// 	await noopProcessKilled(t, pid);
// });

test('kill from port', async t => {
	const port = await getPort();
	const {pid} = childProcess.spawn('node', ['fixture.js', port]);
	await execa('./cli.js', ['--force', pid]);
	await noopProcessKilled(t, pid);
});

test('error when process is not found', async t => {
	await t.throwsAsync(
		execa('./cli.js', ['--force', 'notFoundProcess']),
		{message: /Killing process notFoundProcess failed: Process doesn't exist/},
	);
});

test('force killing process at unused port throws error', async t => {
	await t.throwsAsync(
		execa('./cli.js', ['--force', ':1337']),
		{message: /Killing process :1337 failed: Process doesn't exist/},
	);
});

test('silently force killing process at unused port exits with code 0', async t => {
	const {exitCode} = await execa('./cli.js', ['--force', '--silent', ':1337']);
	t.is(exitCode, 0);
});

// Case-sensitivity tests only work on Unix-like systems
// Windows process names work differently and don't support custom titles via noopProcess
if (process.platform !== 'win32') {
	test('default case-insensitive behavior', async t => {
		const pid = await noopProcess({title: 'DefaultCase'});
		await execa('./cli.js', ['--force', 'defaultcase']);
		await noopProcessKilled(t, pid);
	});

	test('case-sensitive flag makes matching case-sensitive', async t => {
		const pid = await noopProcess({title: 'CaseSensitive'});
		await t.throwsAsync(
			execa('./cli.js', ['--case-sensitive', '--force', 'casesensitive']),
			{message: /Killing process casesensitive failed/},
		);
		// Clean up the process
		await execa('./cli.js', ['--force', pid]);
	});

	test('smart-case with lowercase is case-insensitive', async t => {
		const pid = await noopProcess({title: 'SmartLower'});
		await execa('./cli.js', ['--smart-case', '--force', 'smartlower']);
		await noopProcessKilled(t, pid);
	});

	test('smart-case with uppercase is case-sensitive', async t => {
		const pid = await noopProcess({title: 'smartupper'});
		await t.throwsAsync(
			execa('./cli.js', ['--smart-case', '--force', 'SmartUpper']),
			{message: /Killing process SmartUpper failed/},
		);
		// Clean up the process
		await execa('./cli.js', ['--force', pid]);
	});
}

test('silent flag with -s shortflag works', async t => {
	const {exitCode} = await execa('./cli.js', ['-s', '--force', ':1337']);
	t.is(exitCode, 0);
});

const chromeOne = {
	name: 'Google Chrome',
	cmd: 'Google Chrome --type=renderer',
	pid: 101,
	ports: [],
	cpu: 0,
	memory: 0,
};

const chromeTwo = {
	name: 'Google Chrome',
	cmd: 'Google Chrome --type=gpu-process',
	pid: 102,
	ports: [],
	cpu: 0,
	memory: 0,
};

const redis = {
	name: 'redis',
	cmd: 'redis-server',
	pid: 201,
	ports: ['6379'],
	cpu: 0,
	memory: 0,
};

test('groupByName groups same-name processes and keeps first-seen order', t => {
	const groups = groupByName([chromeOne, redis, chromeTwo]);

	t.is(groups.length, 2);
	t.deepEqual(groups[0], [chromeOne, chromeTwo]);
	t.deepEqual(groups[1], [redis]);
});

test('groupByName returns empty array for no processes', t => {
	t.deepEqual(groupByName([]), []);
});

test('groupByName keeps singleton names as single-item groups', t => {
	t.deepEqual(groupByName([redis]), [[redis]]);
});

test('createChooserChoices collapses duplicate names and leaves singletons unchanged', t => {
	const choices = createChooserChoices([chromeOne, chromeTwo, redis], {}, 1, 3);

	t.is(choices.length, 2);
	t.is(choices[0].name, 'Google Chrome (2)');
	t.deepEqual(choices[0].value, [chromeOne, chromeTwo]);
	t.is(choices[1].value, 201);
});

test('createChooserChoices can leave matching processes ungrouped', t => {
	const choices = createChooserChoices([chromeOne, chromeTwo], {}, 1, 3, {group: false});

	t.is(choices.length, 2);
	t.is(choices[0].value, 101);
	t.is(choices[1].value, 102);
});

test('port searches stay ungrouped; name searches are grouped', t => {
	t.false(shouldGroupSearchResults(':8080'));
	t.true(shouldGroupSearchResults(''));
	t.true(shouldGroupSearchResults('chrome'));
});
