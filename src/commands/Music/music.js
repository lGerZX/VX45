import { SlashCommandBuilder } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import {
    skipTrack,
    stopPlayback,
    pausePlayback,
    resumePlayback,
    shuffleQueue,
    setLoopMode,
    setVolume,
    seekTrack,
    removeFromQueue,
    moveInQueue,
    clearQueue,
    setTwentyFourSeven,
    leaveVoiceChannel,
    replyMusicSuccess,
} from '../../services/music/musicActions.js';
import { deferMusicCommand } from '../../services/music/prefixSupport.js';

export default {
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Gestiona la reproduccion la cola y la configuracion de la sesion de voz')
        .addSubcommand((sub) =>
            sub.setName('pause').setDescription('Pausar la reproduccion'),
        )
        .addSubcommand((sub) =>
            sub.setName('resume').setDescription('Reanudar la reproduccion'),
        )
        .addSubcommand((sub) =>
            sub.setName('skip').setDescription('Saltar la pista actual'),
        )
        .addSubcommand((sub) =>
            sub.setName('stop').setDescription('Detener la reproduccion y limpiar la cola'),
        )
        .addSubcommand((sub) =>
            sub.setName('shuffle').setDescription('Mezclar la cola'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('loop')
                .setDescription('Configurar el modo de bucle')
                .addStringOption((opt) =>
                    opt
                        .setName('mode')
                        .setDescription('Modo de bucle')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Off', value: 'none' },
                            { name: 'Track', value: 'track' },
                            { name: 'Queue', value: 'queue' },
                        ),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('volume')
                .setDescription('Configurar el volumen de reproduccion')
                .addIntegerOption((opt) =>
                    opt.setName('level').setDescription('Volumen de 0 a 100').setRequired(true).setMinValue(0).setMaxValue(100),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('seek')
                .setDescription('Ir a una posicion en la pista actual')
                .addIntegerOption((opt) =>
                    opt.setName('seconds').setDescription('Posicion en segundos').setRequired(true).setMinValue(0),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('remove')
                .setDescription('Eliminar una pista de la cola')
                .addIntegerOption((opt) =>
                    opt.setName('position').setDescription('Posicion en la cola').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub
                .setName('move')
                .setDescription('Mover una pista en la cola')
                .addIntegerOption((opt) =>
                    opt.setName('from').setDescription('Posicion actual').setRequired(true).setMinValue(1),
                )
                .addIntegerOption((opt) =>
                    opt.setName('to').setDescription('Nueva posicion').setRequired(true).setMinValue(1),
                ),
        )
        .addSubcommand((sub) =>
            sub.setName('clear').setDescription('Limpiar la cola'),
        )
        .addSubcommand((sub) =>
            sub.setName('leave').setDescription('Desconectar el bot del canal de voz'),
        )
        .addSubcommand((sub) =>
            sub
                .setName('247')
                .setDescription('Alternar el modo veinticuatro siete para permanecer en el canal de voz cuando este inactivo')
                .addBooleanOption((opt) =>
                    opt.setName('enabled').setDescription('Habilitar o deshabilitar el modo veinticuatro siete').setRequired(true),
                ),
        ),

    async execute(interaction, config, client) {
        await deferMusicCommand(interaction);
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'pause': {
                const embed = await pausePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'resume': {
                const embed = await resumePlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'skip': {
                const embed = await skipTrack(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'stop': {
                const embed = await stopPlayback(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'shuffle': {
                const embed = await shuffleQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'loop': {
                const embed = await setLoopMode(client, interaction, interaction.options.getString('mode'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'volume': {
                const embed = await setVolume(client, interaction, interaction.options.getInteger('level'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'seek': {
                const embed = await seekTrack(client, interaction, interaction.options.getInteger('seconds'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'remove': {
                const embed = await removeFromQueue(client, interaction, interaction.options.getInteger('position'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'move': {
                const embed = await moveInQueue(
                    client,
                    interaction,
                    interaction.options.getInteger('from'),
                    interaction.options.getInteger('to'),
                );
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'clear': {
                const embed = await clearQueue(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case 'leave': {
                const embed = await leaveVoiceChannel(client, interaction);
                await replyMusicSuccess(interaction, embed);
                break;
            }
            case '247': {
                const embed = await setTwentyFourSeven(client, interaction, interaction.options.getBoolean('enabled'));
                await replyMusicSuccess(interaction, embed);
                break;
            }
            default:
                await InteractionHelper.safeEditReply(interaction, {
                    content: 'Subcomando de musica desconocido',
                });
        }
    },
};
