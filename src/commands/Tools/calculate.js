import { SlashCommandBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { createEmbed, successEmbed, infoEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { evaluateMathExpression } from '../../utils/safeMathParser.js';

const calculationContexts = new Map();

function evaluate(expression) {
    return evaluateMathExpression(expression);
}

const calculationHistory = new Map();
const MAX_HISTORY = 5;

export { calculationContexts };

export default {
    data: new SlashCommandBuilder()
        .setName("calculate")
        .setDescription("Evalua una expresion matematica")
        .addStringOption((option) =>
            option
                .setName("expression")
                .setDescription(
                    "La expresion matematica a evaluar por ejemplo 2+2*3 sin(45 deg) 16^0.5",
                )
                .setRequired(true),
        ),

    async execute(interaction) {
        const deferSuccess = await InteractionHelper.safeDefer(interaction);
        if (!deferSuccess) {
            logger.warn(`Calculate interaction defer failed`, {
                userId: interaction.user.id,
                guildId: interaction.guildId,
                commandName: 'calculate'
            });
            return;
        }

        const expression = interaction.options.getString("expression");

        if (
            !/^[0-9+\-*/.()^%! ,<>=&|~?:\[\]{}a-z√π∞°]+$/i.test(expression)
        ) {
            return await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: 'Caracteres no compatibles\n\n' +
                    '✅ Compatibles: Numeros decimales + - * / ^ % sin cos tan sqrt abs log exp pi e ()\n' +
                    '❌ No compatibles: corchetes llaves y otros simbolos'
            });
        }

        const dangerousPatterns = [
            /\b(?:import|require|process|fs|child_process|exec|eval|Function|setTimeout|setInterval|new\s+Function)\s*\(/i,
            /`/g,
            /\$\{.*\}/,
            /\b(?:localStorage|document|window|fetch|XMLHttpRequest)\b/,
            /\b(?:while|for)\s*\([^)]*\)\s*\{/,
            /\b(?:function\*|yield|await|async)\b/,
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(expression)) {
                return await replyUserError(interaction, {
                    type: ErrorTypes.VALIDATION,
                    message: 'Patrones de codigo bloqueados\n\n' +
                        '🚫 Bloqueados: import require eval Function setTimeout setInterval process fs document window fetch bucles async await\n\n' +
                        'La sintaxis de codigo no esta permitida en los calculos'
                });
            }
        }

        let result;
        try {
            result = evaluate(expression);

            let formattedResult;
            if (typeof result === "number") {
                formattedResult = result.toLocaleString("en-US", {
                    maximumFractionDigits: 10,
                });

                if (
                    Math.abs(result) > 0 &&
                    (Math.abs(result) >= 1e10 || Math.abs(result) < 1e-3)
                ) {
                    formattedResult = result.toExponential(6);
                }
            } else if (typeof result === "boolean") {
                formattedResult = result ? "true" : "false";
            } else if (result === null || result === undefined) {
                formattedResult = "Sin resultado";
            } else if (
                Array.isArray(result) ||
                typeof result === "object"
            ) {
                formattedResult =
                    "```json\n" + JSON.stringify(result, null, 2) + "\n```";
            } else {
                formattedResult = String(result);
            }

            const userId = interaction.user.id;
            if (!calculationHistory.has(userId)) {
                calculationHistory.set(userId, []);
            }

            const history = calculationHistory.get(userId);
            history.unshift({
                expression,
                result: formattedResult,
                timestamp: Date.now(),
            });

            if (history.length > MAX_HISTORY) {
                history.pop();
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_add`)
                    .setLabel("+")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_subtract`)
                    .setLabel("-")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_multiply`)
                    .setLabel("×")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_divide`)
                    .setLabel("÷")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`calc_${interaction.id}_history`)
                    .setLabel("Historia")
                    .setStyle(ButtonStyle.Secondary),
            );

            const embed = successEmbed(
                "🧮 Resultado del calculo",
                `**Expresion:** \`${expression.replace(/`/g, "\`")}\`\n` +
                    `**Resultado:** \`${formattedResult}\`\n\n` +
                    `*Usa los botones de abajo para realizar operaciones con el resultado*`,
            );

            await InteractionHelper.safeEditReply(interaction, {
                embeds: [embed],
                components: [row],
            });

            const filter = (i) =>
                i.customId.startsWith(`calc_${interaction.id}`) &&
                i.user.id === interaction.user.id;
            const BUTTON_TIMEOUT = 300000;
            const collector =
                interaction.channel.createMessageComponentCollector({
                    filter,
                    time: BUTTON_TIMEOUT,
                });

            collector.on("collect", async (i) => {
                try {
                    const operation = i.customId.split("_")[2];

                    if (operation === "history") {
                        if (!i.deferred && !i.replied) {
                            await i.deferUpdate().catch(console.error);
                        }

                        const userHistory =
                            calculationHistory.get(userId) || [];

                        if (userHistory.length === 0) {
                            await i.followUp({
                                content: "No hay historial de calculos",
                                flags: ["Ephemeral"],
                            });
                            return;
                        }

                        const historyText = userHistory
                            .map(
                                (item, index) =>
                                    `${index + 1} **${item.expression}** = \`${item.result}\`\n` +
                                    `<t:${Math.floor(item.timestamp / 1000)}:R>`,
                            )
                            .join("\n\n");

                        await i.followUp({
                            content: `📜 **Tu historial de calculos**\n\n${historyText}`,
                            flags: ["Ephemeral"],
                        });
                        return;
                    }

                    let operator = "";

                    switch (operation) {
                        case "add":
                            operator = "+";
                            break;
                        case "subtract":
                            operator = "-";
                            break;
                        case "multiply":
                            operator = "*";
                            break;
                        case "divide":
                            operator = "/";
                            break;
                    }

                    try {
                        const contextKey = `${i.user.id}_${operation}`;
                        calculationContexts.set(contextKey, {
                            expression,
                            formattedResult,
                            operator,
                            messageId: interaction.message?.id,
                            channelId: interaction.channelId,
                            userId: i.user.id
                        });

                        await i.showModal({
                            customId: `calc_modal:${operation}`,
                            title: `Ingresa un numero para ${operation}`,
                            components: [
                                {
                                    type: 1,
                                    components: [
                                        {
                                            type: 4,
                                            customId: `operand:${contextKey}`,
                                            label: `Numero para ${operator} con ${formattedResult}`,
                                            placeholder: "Ingresa un numero",
                                            style: 1,
                                            required: true,
                                            maxLength: 50,
                                        },
                                    ],
                                },
                            ],
                        });
                    } catch (modalError) {
                        logger.error("Failed to show modal:", modalError);
                        if (!i.replied && !i.deferred) {
                            await i.reply({
                                content: "No se pudo abrir la calculadora intenta de nuevo",
                                flags: ["Ephemeral"],
                            }).catch(console.error);
                        }
                        return;
                    }

                } catch (error) {
                    logger.error("Button interaction error:", error);
                    if (!i.deferred && !i.replied) {
                        await i.followUp({
                            content: "Ocurrio un error al procesar tu solicitud",
                            flags: ["Ephemeral"],
                        }).catch(console.error);
                    }
                }
            });

            collector.on("end", (collected, reason) => {
                if (reason === "timeout") {
                    const disabledRow =
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(
                                    `calc_${interaction.id}_expired`,
                                )
                                .setLabel("Calculadora vencida")
                                .setStyle(ButtonStyle.Secondary)
                                .setDisabled(true),
                        );

                    interaction
                        .editReply({
                            components: [disabledRow],
                            content:
                                "⏱️ Esta calculadora vencio Usa el comando otra vez para hacer mas calculos",
                        })
                        .catch(console.error);
                } else {
                    const disabledRow = ActionRowBuilder.from(
                        row,
                    ).setComponents(
                        row.components.map((component) =>
                            ButtonBuilder.from(component).setDisabled(true),
                        ),
                    );

                    interaction
                        .editReply({ components: [disabledRow] })
                        .catch(console.error);
                }
            });
        } catch (error) {
            logger.error('Calculation error:', error);

            let errorMessage = 'No se pudo evaluar la expresion';

            if (error.message.includes('Unexpected type')) {
                errorMessage +=
                    ' La expresion contiene una operacion o funcion no compatible';
            } else if (error.message.includes('Undefined symbol')) {
                errorMessage +=
                    ' La expresion contiene una variable o funcion no definida';
            } else if (error.message.includes('Brackets not balanced')) {
                errorMessage += ' La expresion tiene corchetes desbalanceados';
            } else if (
                error.message.includes('Unexpected operator') ||
                error.message.includes('Unexpected character')
            ) {
                errorMessage +=
                    ' La expresion contiene un operador o caracter no valido';
            } else {
                errorMessage += ' Revisa la sintaxis e intenta otra vez';
            }

            await replyUserError(interaction, {
                type: ErrorTypes.VALIDATION,
                message: errorMessage,
            });
        }
    },
};
