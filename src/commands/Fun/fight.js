import { SlashCommandBuilder } from 'discord.js';
import { successEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';

import { InteractionHelper } from '../../utils/interactionHelper.js';
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const EMBED_DESCRIPTION_LIMIT = 4096;

export default {
    data: new SlashCommandBuilder()
        .setName("fight")
        .setDescription("Inicia una batalla simulada 1v1 basada en texto")
        .addUserOption((option) =>
            option
                .setName("opponent")
                .setDescription("El usuario al que quieres enfrentar")
                .setRequired(true),
        ),
    category: 'Fun',

    async execute(interaction, config, client) {
        await InteractionHelper.safeDefer(interaction);

        const challenger = interaction.user;
        const opponent = interaction.options.getUser("opponent");

        if (challenger.id === opponent.id) {
            const embed = warningEmbed(
                "⚔️ Desafio invalido",
                `**${challenger.username}**, no puedes pelear contra ti mismo Eso es un empate antes de empezar`
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (opponent.bot) {
            const embed = warningEmbed(
                "⚔️ Oponente invalido",
                "No puedes pelear contra bots Desafia a una persona real en su lugar"
            );
            return await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        const winner = rand(0, 1) === 0 ? challenger : opponent;
        const loser = winner.id === challenger.id ? opponent : challenger;
        const rounds = rand(3, 7);
        const damage = rand(10, 50);

        const log = [];
        log.push(
            `💥 **${challenger.username}** desafia a **${opponent.username}** a un duelo! (Al mejor de ${rounds} rondas)`,
        );

        for (let i = 1; i <= rounds; i++) {
            const attacker = rand(0, 1) === 0 ? challenger : opponent;
            const target = attacker.id === challenger.id ? opponent : challenger;
            const action = [
                "lanza un punetazo salvaje",
                "asesta un golpe critico",
                "usa un hechizo debil",
                "desvia y contraataca",
            ][rand(0, 3)];
            log.push(
                `\n**Ronda ${i}:** ${attacker.username} ${action} a ${target.username} e inflige ${rand(1, damage)} de dano!`,
            );
        }

        const outcomeText = log.join("\n");
        const winnerText = `👑 **${winner.username}** ha derrotado a ${loser.username} y se lleva la victoria!`;
        const fullDescription = `${outcomeText}\n\n${winnerText}`;

        const description = fullDescription.length <= EMBED_DESCRIPTION_LIMIT
            ? fullDescription
            : `${fullDescription.slice(0, EMBED_DESCRIPTION_LIMIT - 15)}\n\n...`;

        const embed = successEmbed(
            "🏆 Duelo completado",
            description
        );

        await InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        logger.debug(`Fight command executed between ${challenger.id} and ${opponent.id} in guild ${interaction.guildId}`);
    },
};
