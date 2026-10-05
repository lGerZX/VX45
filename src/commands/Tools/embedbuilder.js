import {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ChannelSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ComponentType,
    ChannelType,
    EmbedBuilder,
    LabelBuilder,
    RadioGroupBuilder,
} from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { successEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { TitanBotError, replyUserError, ErrorTypes } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

const MAX_FIELDS = 25;
const IDLE_TIMEOUT = 900_000;

const COLOR_PRESETS = [
    { label: 'Primary (Blue)', value: '#336699', emoji: '' },
    { label: 'Success (Green)', value: '#57F287', emoji: '' },
    { label: 'Error (Red)', value: '#ED4245', emoji: '' },
    { label: 'Warning (Yellow)', value: '#FEE75C', emoji: '' },
    { label: 'Info (Bright Blue)', value: '#3498DB', emoji: '' },
    { label: 'Blurple (Discord)', value: '#5865F2', emoji: '' },
    { label: 'Fuchsia', value: '#EB459E', emoji: '' },
    { label: 'Gold', value: '#F1C40F', emoji: '' },
    { label: 'White', value: '#FFFFFF', emoji: '' },
    { label: 'Dark', value: '#202225', emoji: '' },
    { label: 'Custom Hex...', value: '__custom__', emoji: '' },
];

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function isValidHex(str) {
    return /^#[0-9A-Fa-f]{6}$/.test(str);
}

function resolveEmbedColor(value) {
    try {
        const resolved = getColor(value || 'primary');
        if (typeof resolved === 'number' && Number.isFinite(resolved) && resolved >= 0 && resolved <= 0xffffff) {
            return resolved;
        }
    } catch {
        // ignore invalid value and fall through to primary
    }
    return getColor('primary');
}

function buildPreviewEmbed(state) {
    const embed = new EmbedBuilder();

    if (state.title) embed.setTitle(state.title.substring(0, 256));
    if (state.description) embed.setDescription(state.description.substring(0, 4096));

    embed.setColor(resolveEmbedColor(state.color));

    if (state.author?.name) {
        const obj = { name: state.author.name.substring(0, 256) };
        if (state.author.iconUrl && isValidUrl(state.author.iconUrl)) obj.iconURL = state.author.iconUrl;
        if (state.author.url && isValidUrl(state.author.url)) obj.url = state.author.url;
        embed.setAuthor(obj);
    }

    if (state.footer?.text) {
        const obj = { text: state.footer.text.substring(0, 2048) };
        if (state.footer.iconUrl && isValidUrl(state.footer.iconUrl)) obj.iconURL = state.footer.iconUrl;
        embed.setFooter(obj);
    }

    if (state.thumbnail && isValidUrl(state.thumbnail)) embed.setThumbnail(state.thumbnail);
    if (state.image && isValidUrl(state.image)) embed.setImage(state.image);
    if (state.timestamp) embed.setTimestamp();

    if (state.fields.length > 0) embed.addFields(state.fields.slice(0, 25));

    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        embed.setDescription('*(Vacio — usa el menu de abajo para anadir contenido)*');
    }

    return embed;
}

function buildDashboardEmbed(state) {
    const trunc = (str, n) =>
        str.length > n ? str.substring(0, n) + '…' : str;

    const lines = [
        `**Titulo** › ${state.title ? \`\`${trunc(state.title, 40)}\`\` : '\`No establecido\''}`,
        `**Descripcion** › ${state.description ? \`${state.description.length} caracter${state.description.length === 1 ? '' : 'es'}\` : '\`No establecida\''}`,
        `**Color** › ${state.color ? \`\`${state.color}\`\` : '\`Predeterminado\''}`,
        `**Autor** › ${state.author?.name ? \`\`${trunc(state.author.name, 30)}\`\` : '\`No establecido\''}`,
        `**Pie** › ${state.footer?.text ? \`\`${trunc(state.footer.text, 30)}\`\` : '\`No establecido\''}`,
        `**Miniatura** › ${state.thumbnail ? '✅ Establecida' : '\`No establecida\''}`,
        `**Imagen** › ${state.image ? '✅ Establecida' : '\`No establecida\''}`,
        `**Marca de tiempo** › ${state.timestamp ? '✅ Activada' : '\`Desactivada\''}`,
        `**Campos** › ${state.fields.length} / ${MAX_FIELDS}`,
    ];

    return new EmbedBuilder()
        .setTitle('Panel de control del creador de embeds')
        .setDescription(lines.join('\n'))
        .setColor(getColor('info'))
        .setFooter({ text: 'La vista previa se actualiza en vivo · Se cierra despues de 5 minutos de inactividad' });
}

function buildMainMenu(state) {
    const primaryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_edit_content')
            .setLabel('Editar contenido')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✏️'),
        new ButtonBuilder()
            .setCustomId('eb_main_set_color')
            .setLabel('Configurar color')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎨'),
        new ButtonBuilder()
            .setCustomId('eb_main_set_images')
            .setLabel('Configurar imagenes')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🖼️'),
        new ButtonBuilder()
            .setCustomId('eb_main_post_embed')
            .setLabel('Publicar embed')
            .setStyle(ButtonStyle.Success)
            .setEmoji('📤'),
    );

    const secondaryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_add_field')
            .setLabel(`Anadir campo (${state.fields.length}/${MAX_FIELDS})`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➕'),
        new ButtonBuilder()
            .setCustomId('eb_main_edit_field')
            .setLabel('Editar campo')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
            .setDisabled(state.fields.length === 0),
        new ButtonBuilder()
            .setCustomId('eb_main_remove_field')
            .setLabel('Quitar campo')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('➖')
            .setDisabled(state.fields.length === 0),
        new ButtonBuilder()
            .setCustomId('eb_main_toggle_timestamp')
            .setLabel(state.timestamp ? 'Desactivar marca de tiempo' : 'Activar marca de tiempo')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🕐'),
    );

    const tertiaryRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('eb_main_reorder_fields')
            .setLabel('Reordenar campos')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('↕️')
            .setDisabled(state.fields.length < 2),
        new ButtonBuilder()
            .setCustomId('eb_main_json_export')
            .setLabel('JSON / datos sin procesar')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📋'),
        new ButtonBuilder()
            .setCustomId('eb_main_reset_all')
            .setLabel('Restablecer todo')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🗑️'),
    );

    return [primaryRow, secondaryRow, tertiaryRow];
}

async function refreshDashboard(interaction, state) {
    return await InteractionHelper.safeEditReply(interaction, {
        embeds: [buildPreviewEmbed(state), buildDashboardEmbed(state)],
        components: buildMainMenu(state),
    });
}

async function handleEditContent(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_content')
        .setTitle('Editar contenido')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_title')
                    .setLabel('Titulo (max 256 caracteres)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.title || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Titulo de mi embed'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('eb_description')
                    .setLabel('Descripcion (max 4000 caracteres)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setValue(state.description ? state.description.substring(0, 4000) : '')
                    .setMaxLength(4000)
                    .setRequired(false)
                    .setPlaceholder('Escribe la descripcion de tu embed aqui...'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_content' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    await submitted.deferUpdate().catch(() => {});

    state.title = submitted.fields.getTextInputValue('eb_title').trim() || null;
    state.description = submitted.fields.getTextInputValue('eb_description').trim() || null;

    await refreshDashboard(rootInteraction, state);
}

async function handleSetColor(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const colorSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_color_pick')
        .setPlaceholder('Elige un color...')
        .addOptions(
            COLOR_PRESETS.map(c =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.value)
                    .setEmoji(c.emoji)
                    .setDescription(c.value !== '__custom__' ? c.value : 'Ingresa tu valor propio #RRGGBB'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Configurar color')
                .setDescription(
                    'Selecciona un color predefinido o elige **Hex personalizado** para ingresar tu propio valor `#RRGGBB`',
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(colorSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const colorCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_color_pick',
        time: 60_000,
        max: 1,
    });

    colorCollector.on('collect', async colorInter => {
        try {
            const picked = colorInter.values[0];

            if (picked === '__custom__') {
                const hexModal = new ModalBuilder()
                    .setCustomId('eb_custom_hex')
                    .setTitle('Color personalizado')
                    .addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('hex_value')
                                .setLabel('Codigo de color Hex')
                                .setStyle(TextInputStyle.Short)
                                .setPlaceholder('#5865F2')
                                .setMaxLength(7)
                                .setMinLength(7)
                                .setRequired(true),
                        ),
                    );

                const shown = await InteractionHelper.safeShowModal(colorInter, hexModal);
                if (!shown) return;

                const hexSubmit = await colorInter
                    .awaitModalSubmit({
                        filter: i =>
                            i.customId === 'eb_custom_hex' && i.user.id === colorInter.user.id,
                        time: 60_000,
                    })
                    .catch(() => null);

                if (!hexSubmit) return;

                const hex = hexSubmit.fields.getTextInputValue('hex_value').trim();
                if (!isValidHex(hex)) {
                    await replyUserError(hexSubmit, {
                        type: ErrorTypes.USER_INPUT,
                        message: `\`${hex}\` no es un color hex valido Usa el formato \`#RRGGBB\` (por ejemplo \`#5865F2\`)`,
                    });
                    return;
                }

                state.color = hex;
                await hexSubmit.deferUpdate().catch(() => {});
            } else {
                state.color = picked;
                await colorInter.deferUpdate().catch(() => {});
            }

            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('La interaccion del selector de color del creador de embeds fallo:', error.message);
        }
    });
}

async function handleSetAuthor(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_author')
        .setTitle('Configurar autor')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_name')
                    .setLabel('Nombre del autor (deja en blanco para quitarlo)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.name || '')
                    .setMaxLength(256)
                    .setRequired(false)
                    .setPlaceholder('Tu nombre'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_icon')
                    .setLabel('URL del icono del autor (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('author_url')
                    .setLabel('URL del enlace del autor (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.author?.url || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_author' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name = submitted.fields.getTextInputValue('author_name').trim();
    const iconUrl = submitted.fields.getTextInputValue('author_icon').trim();
    const url = submitted.fields.getTextInputValue('author_url').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'La URL del icono del autor debe ser una URL valida `https://`',
        });
        return;
    }
    if (url && !isValidUrl(url)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'La URL del enlace del autor debe ser una URL valida `https://`',
        });
        return;
    }

    state.author = name ? { name, iconUrl: iconUrl || null, url: url || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetFooter(selectInteraction, rootInteraction, state) {
    const modal = new ModalBuilder()
        .setCustomId('eb_footer')
        .setTitle('Configurar pie')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_text')
                    .setLabel('Texto del pie (deja en blanco para quitarlo)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.text || '')
                    .setMaxLength(2048)
                    .setRequired(false)
                    .setPlaceholder('Hecho con TitanBot'),
            ),
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('footer_icon')
                    .setLabel('URL del icono del pie (opcional)')
                    .setStyle(TextInputStyle.Short)
                    .setValue(state.footer?.iconUrl || '')
                    .setRequired(false)
                    .setPlaceholder('https://example.com/icon.png'),
            ),
        );

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_footer' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const text = submitted.fields.getTextInputValue('footer_text').trim();
    const iconUrl = submitted.fields.getTextInputValue('footer_icon').trim();

    if (iconUrl && !isValidUrl(iconUrl)) {
        await replyUserError(submitted, {
            type: ErrorTypes.USER_INPUT,
            message: 'La URL del icono del pie debe ser una URL valida `https://`',
        });
        return;
    }

    state.footer = text ? { text, iconUrl: iconUrl || null } : null;

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleSetImages(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate().catch(() => {});

    const imageSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_image_pick')
        .setPlaceholder('Que te gustaria cambiar?')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Configurar miniatura')
                .setDescription('Imagen pequena mostrada en la esquina superior derecha')
                .setValue('set_thumbnail')
                .setEmoji('🖼️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Configurar imagen grande')
                .setDescription('Imagen de ancho completo en la parte inferior')
                .setValue('set_image')
                .setEmoji('📸'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Quitar miniatura')
                .setDescription('Elimina la miniatura actual')
                .setValue('clear_thumbnail')
                .setEmoji('🗑️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Quitar imagen grande')
                .setDescription('Elimina la imagen grande actual')
                .setValue('clear_image')
                .setEmoji('🗑️'),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Configurar imagenes')
                .setDescription('Elige que imagen configurar o quitar')
                .addFields(
                    { name: 'Miniatura', value: state.thumbnail ? `[Ver](${state.thumbnail})` : '`No establecida`', inline: true },
                    { name: 'Imagen grande', value: state.image ? `[Ver](${state.image})` : '`No establecida`', inline: true },
                )
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(imageSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const imgMenuCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_image_pick',
        time: 60_000,
        max: 1,
    });

    imgMenuCollector.on('collect', async imgInter => {
        try {
            const pick = imgInter.values[0];

            if (pick === 'clear_thumbnail') {
                state.thumbnail = null;
                await imgInter.deferUpdate();
                await refreshDashboard(rootInteraction, state);
                return;
            }
            if (pick === 'clear_image') {
                state.image = null;
                await imgInter.deferUpdate();
                await refreshDashboard(rootInteraction, state);
                return;
            }

            const isThumb = pick === 'set_thumbnail';

            const urlModal = new ModalBuilder()
                .setCustomId('eb_image_url')
                .setTitle(isThumb ? 'Configurar miniatura' : 'Configurar imagen grande')
                .addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('image_url')
                            .setLabel('URL de la imagen')
                            .setStyle(TextInputStyle.Short)
                            .setValue(isThumb ? (state.thumbnail || '') : (state.image || ''))
                            .setRequired(true)
                            .setPlaceholder('https://example.com/image.png'),
                    ),
                );

            const shown = await InteractionHelper.safeShowModal(imgInter, urlModal);
            if (!shown) return;

            const submitted = await imgInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_image_url' && i.user.id === imgInter.user.id,
                    time: 60_000,
                })
                .catch(() => null);

            if (!submitted) return;

            const url = submitted.fields.getTextInputValue('image_url').trim();
            if (!isValidUrl(url)) {
                await replyUserError(submitted, {
                    type: ErrorTypes.USER_INPUT,
                    message: 'La URL de la imagen debe ser un enlace `https://` valido a una imagen accesible publicamente',
                });
                return;
            }

            if (isThumb) state.thumbnail = url;
            else state.image = url;

            await submitted.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('La interaccion del selector de imagen del creador de embeds fallo:', error.message);
        }
    });
}

async function handleAddField(selectInteraction, rootInteraction, state) {
    if (state.fields.length >= MAX_FIELDS) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: `Los embeds pueden tener un maximo de ${MAX_FIELDS} campos`,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId('eb_add_field')
        .setTitle('Anadir campo');

    const fieldNameLabel = new LabelBuilder()
        .setLabel('Nombre del campo (max 256 caracteres)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_name')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(256)
                .setRequired(true)
                .setPlaceholder('Titulo del campo'),
        );

    const fieldValueLabel = new LabelBuilder()
        .setLabel('Valor del campo (max 1024 caracteres)')
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId('field_value')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(1024)
                .setRequired(true)
                .setPlaceholder('El contenido del campo va aqui...'),
        );

    const inlineRadio = new RadioGroupBuilder()
        .setCustomId('field_inline')
        .setRequired(false)
        .addOptions([
            { label: 'No — ancho completo', value: 'no' },
            { label: 'Si — uno al lado del otro', value: 'yes' },
        ]);

    const inlineLabel = new LabelBuilder()
        .setLabel('Mostrar en linea?')
        .setRadioGroupComponent(inlineRadio);

    modal.addLabelComponents(fieldNameLabel, fieldValueLabel, inlineLabel);

    const shown = await InteractionHelper.safeShowModal(selectInteraction, modal);
    if (!shown) return;

    const submitted = await selectInteraction
        .awaitModalSubmit({
            filter: i => i.customId === 'eb_add_field' && i.user.id === selectInteraction.user.id,
            time: 120_000,
        })
        .catch(() => null);

    if (!submitted) return;

    const name = submitted.fields.getTextInputValue('field_name').trim();
    const value = submitted.fields.getTextInputValue('field_value').trim();
    const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

    state.fields.push({ name, value, inline });

    await submitted.deferUpdate().catch(() => {});
    await refreshDashboard(rootInteraction, state);
}

async function handleEditField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_edit_field_pick')
        .setPlaceholder('Selecciona un campo para editar...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 80)}${f.value.length > 80 ? '…' : ''} · ${f.inline ? 'En linea' : 'Bloque'}`,
                    )
                    .setValue(String(i))
                    .setEmoji('📝'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Editar campo')
                .setDescription('Selecciona el campo que quieres modificar')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_edit_field_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        try {
            const idx = parseInt(pickInter.values[0], 10);
            const field = state.fields[idx];
            if (!field) { await pickInter.deferUpdate(); return; }

            const modal = new ModalBuilder()
                .setCustomId('eb_edit_field_modal')
                .setTitle(`Editar campo ${idx + 1}`);

            const editNameLabel = new LabelBuilder()
                .setLabel('Nombre del campo')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('field_name')
                        .setStyle(TextInputStyle.Short)
                        .setValue(field.name)
                        .setMaxLength(256)
                        .setRequired(true),
                );

            const editValueLabel = new LabelBuilder()
                .setLabel('Valor del campo')
                .setTextInputComponent(
                    new TextInputBuilder()
                        .setCustomId('field_value')
                        .setStyle(TextInputStyle.Paragraph)
                        .setValue(field.value.substring(0, 4000))
                        .setMaxLength(1024)
                        .setRequired(true),
                );

            const editInlineRadio = new RadioGroupBuilder()
                .setCustomId('field_inline')
                .setRequired(false)
                .addOptions([
                    { label: 'No — ancho completo', value: 'no' },
                    { label: 'Si — uno al lado del otro', value: 'yes' },
                ]);

            if (field.inline) {
                editInlineRadio.setOptions([
                    { label: 'No — ancho completo', value: 'no' },
                    { label: 'Si — uno al lado del otro', value: 'yes', default: true },
                ]);
            }

            const editInlineLabel = new LabelBuilder()
                .setLabel('Mostrar en linea?')
                .setRadioGroupComponent(editInlineRadio);

            modal.addLabelComponents(editNameLabel, editValueLabel, editInlineLabel);

            const shown = await InteractionHelper.safeShowModal(pickInter, modal);
            if (!shown) return;

            const submitted = await pickInter
                .awaitModalSubmit({
                    filter: i =>
                        i.customId === 'eb_edit_field_modal' && i.user.id === pickInter.user.id,
                    time: 120_000,
                })
                .catch(() => null);

            if (!submitted) return;

            const name = submitted.fields.getTextInputValue('field_name').trim();
            const value = submitted.fields.getTextInputValue('field_value').trim();
            const inline = submitted.fields.getRadioGroup('field_inline') === 'yes';

            state.fields[idx] = { name, value, inline };

            await submitted.deferUpdate().catch(() => {});
            await refreshDashboard(rootInteraction, state);
        } catch (error) {
            logger.warn('La interaccion de edicion de campos del creador de embeds fallo:', error.message);
        }
    });
}

async function handleRemoveField(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_remove_field_pick')
        .setPlaceholder('Selecciona un campo para quitar...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('➖'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Quitar campo')
                .setDescription('Selecciona el campo que quieres eliminar')
                .setColor(getColor('warning')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const removeCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_remove_field_pick',
        time: 60_000,
        max: 1,
    });

    removeCollector.on('collect', async removeInter => {
        await removeInter.deferUpdate();
        const idx = parseInt(removeInter.values[0], 10);
        state.fields.splice(idx, 1);
        await refreshDashboard(rootInteraction, state);
    });
}

async function handleReorderFields(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const pickSelect = new StringSelectMenuBuilder()
        .setCustomId('eb_reorder_pick')
        .setPlaceholder('Selecciona un campo para mover...')
        .addOptions(
            state.fields.slice(0, 25).map((f, i) =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(`${i + 1}. ${f.name.substring(0, 50)}`)
                    .setDescription(
                        `${f.value.substring(0, 90)}${f.value.length > 90 ? '…' : ''}`,
                    )
                    .setValue(String(i))
                    .setEmoji('↕️'),
            ),
        );

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Reordenar campos')
                .setDescription('Selecciona un campo y luego usa las flechas para moverlo arriba o abajo')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(pickSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const pickCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_reorder_pick',
        time: 60_000,
        max: 1,
    });

    pickCollector.on('collect', async pickInter => {
        await pickInter.deferUpdate();
        const sourceIdx = parseInt(pickInter.values[0], 10);

        const upBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_up')
            .setLabel('Mover arriba')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬆️')
            .setDisabled(sourceIdx === 0);

        const downBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_down')
            .setLabel('Mover abajo')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('⬇️')
            .setDisabled(sourceIdx === state.fields.length - 1);

        const cancelBtn = new ButtonBuilder()
            .setCustomId('eb_reorder_cancel')
            .setLabel('Cancelar')
            .setStyle(ButtonStyle.Secondary);

        await pickInter.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Mover campo')
                    .setDescription(
                        `Moviendo **${state.fields[sourceIdx].name}** — actualmente en la posicion **${sourceIdx + 1}** de **${state.fields.length}**`,
                    )
                    .setColor(getColor('info')),
            ],
            components: [new ActionRowBuilder().addComponents(upBtn, downBtn, cancelBtn)],
            flags: MessageFlags.Ephemeral,
        });

        const dirCollector = rootInteraction.channel.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i =>
                i.user.id === selectInteraction.user.id &&
                ['eb_reorder_up', 'eb_reorder_down', 'eb_reorder_cancel'].includes(i.customId),
            time: 30_000,
            max: 1,
        });

        dirCollector.on('collect', async dirInter => {
            await dirInter.deferUpdate();
            if (dirInter.customId === 'eb_reorder_cancel') return;

            const targetIdx =
                dirInter.customId === 'eb_reorder_up' ? sourceIdx - 1 : sourceIdx + 1;

            if (targetIdx < 0 || targetIdx >= state.fields.length) return;

            const temp = state.fields[sourceIdx];
            state.fields[sourceIdx] = state.fields[targetIdx];
            state.fields[targetIdx] = temp;

            await refreshDashboard(rootInteraction, state);
        });
    });
}

async function handlePostEmbed(selectInteraction, rootInteraction, state, guild) {
    if (
        !state.title &&
        !state.description &&
        state.fields.length === 0 &&
        !state.author?.name
    ) {
        await selectInteraction.deferUpdate();
        await replyUserError(selectInteraction, {
            type: ErrorTypes.VALIDATION,
            message: 'Anade al menos un titulo, descripcion o campo antes de publicar',
        });
        return;
    }

    await selectInteraction.deferUpdate();

    const chanSelect = new ChannelSelectMenuBuilder()
        .setCustomId('eb_post_channel')
        .setPlaceholder('Selecciona un canal...')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);

    await selectInteraction.followUp({
        embeds: [
            new EmbedBuilder()
                .setTitle('Publicar embed')
                .setDescription('Selecciona el canal donde se enviara este embed')
                .setColor(getColor('info')),
        ],
        components: [new ActionRowBuilder().addComponents(chanSelect)],
        flags: MessageFlags.Ephemeral,
    });

    const chanCollector = rootInteraction.channel.createMessageComponentCollector({
        componentType: ComponentType.ChannelSelect,
        filter: i =>
            i.user.id === selectInteraction.user.id && i.customId === 'eb_post_channel',
        time: 60_000,
        max: 1,
    });

    chanCollector.on('collect', async chanInter => {
        await chanInter.deferUpdate();
        const channel = chanInter.channels.first();

        if (!channel) {
            await replyUserError(chanInter, {
                type: ErrorTypes.USER_INPUT,
                message: 'No se pudo resolver el canal seleccionado',
            });
            return;
        }

        const perms = channel.permissionsFor(guild.members.me);
        if (!perms?.has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
            await replyUserError(chanInter, {
                type: ErrorTypes.PERMISSION,
                message: `Necesito permisos de **Enviar mensajes** y **Enlaces de embed** en ${channel} para publicarlo ahi`,
            });
            return;
        }

        const finalEmbed = buildPreviewEmbed(state);

        if (finalEmbed.data.description === '*(Vacio — usa el menu de abajo para anadir contenido)*') {
            finalEmbed.setDescription(null);
        }

        await channel.send({ embeds: [finalEmbed] });

        await chanInter.followUp({
            embeds: [successEmbed('Embed enviado', `Tu embed se ha publicado en ${channel}`)],
            flags: MessageFlags.Ephemeral,
        });
    });
}

async function handleJsonExport(selectInteraction, rootInteraction, state) {
    await selectInteraction.deferUpdate();

    const previewEmbed = buildPreviewEmbed(state);
    const json = JSON.stringify(previewEmbed.toJSON(), null, 2);

    if (json.length <= 3980) {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription(`\`\`\`json\n${json}\n\`\`\``)
                    .setColor(getColor('info')),
            ],
            flags: MessageFlags.Ephemeral,
        });
    } else {
        await selectInteraction.followUp({
            embeds: [
                new EmbedBuilder()
                    .setTitle('Embed JSON')
                    .setDescription('El JSON es demasiado largo para mostrarse inline — mira el archivo adjunto')
                    .setColor(getColor('info')),
            ],
            files: [
                {
                    attachment: Buffer.from(json, 'utf-8'),
                    name: 'embed.json',
                },
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
}

export default {
    slashOnly: true,
    data: new SlashCommandBuilder()
        .setName('embedbuilder')
        .setDescription('Crea y publica un embed personalizado con vista previa en vivo')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction) {
        try {
            const deferSuccess = await InteractionHelper.safeDefer(interaction, {
                flags: MessageFlags.Ephemeral,
            });
            if (!deferSuccess) return;

            const guild = interaction.guild;

            const state = {
                title: null,
                description: null,
                color: getColor('primary'),
                author: null,
                footer: null,
                thumbnail: null,
                image: null,
                timestamp: false,
                fields: [],
            };

            await refreshDashboard(interaction, state);

            const collector = interaction.channel.createMessageComponentCollector({
                componentType: ComponentType.Button,
                filter: i =>
                    i.user.id === interaction.user.id && i.customId.startsWith('eb_main_'),
                time: IDLE_TIMEOUT,
            });

            collector.on('collect', async ci => {
                try {
                    switch (ci.customId) {
                        case 'eb_main_edit_content':
                            await handleEditContent(ci, interaction, state);
                            break;
                        case 'eb_main_set_color':
                            await handleSetColor(ci, interaction, state);
                            break;
                        case 'eb_main_set_images':
                            await handleSetImages(ci, interaction, state);
                            break;
                        case 'eb_main_post_embed':
                            await handlePostEmbed(ci, interaction, state, guild);
                            break;
                        case 'eb_main_add_field':
                            await handleAddField(ci, interaction, state);
                            break;
                        case 'eb_main_edit_field':
                            await handleEditField(ci, interaction, state);
                            break;
                        case 'eb_main_remove_field':
                            await handleRemoveField(ci, interaction, state);
                            break;
                        case 'eb_main_reorder_fields':
                            await handleReorderFields(ci, interaction, state);
                            break;
                        case 'eb_main_toggle_timestamp':
                            state.timestamp = !state.timestamp;
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        case 'eb_main_json_export':
                            await handleJsonExport(ci, interaction, state);
                            break;
                        case 'eb_main_reset_all':
                            state.title = null;
                            state.description = null;
                            state.color = getColor('primary');
                            state.author = null;
                            state.footer = null;
                            state.thumbnail = null;
                            state.image = null;
                            state.timestamp = false;
                            state.fields = [];
                            await ci.deferUpdate();
                            await refreshDashboard(interaction, state);
                            break;
                        default:
                            await ci.deferUpdate();
                    }
                } catch (error) {
                    logger.error('Error en el colector de embedbuilder:', error);
                    const msg =
                        error instanceof TitanBotError
                            ? error.userMessage || 'Ocurrio un error'
                            : 'Ocurrio un error inesperado';
                    if (!ci.replied && !ci.deferred) await ci.deferUpdate().catch(() => {});
                    await replyUserError(ci, {
                        type: ErrorTypes.UNKNOWN,
                        message: msg,
                    }).catch(() => {});
                }
            });

            collector.on('end', async (_, reason) => {
                if (reason === 'time') {
                    await InteractionHelper.safeEditReply(interaction, { components: [] }).catch(() => {});
                }
            });
        } catch (error) {
            if (error instanceof TitanBotError) throw error;
            logger.error('Error inesperado en embedbuilder:', error);
            throw new TitanBotError(
                `embedbuilder fallo: ${error.message}`,
                ErrorTypes.UNKNOWN,
                'No se pudo abrir el creador de embeds',
            );
        }
    },
};
